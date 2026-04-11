from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, send_file, send_from_directory, abort
)
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import os
import uuid
from werkzeug.utils import secure_filename
import openpyxl
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'car_maintenance_tracker_secret_2024')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///car_maintenance.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'bmp'}

MAINTENANCE_TYPES = [
    '給油',
    'オイル交換',
    'タイヤ交換',
    '車検',
    '保険',
    'ワイパー交換',
    '洗車',
    'その他整備',
]

db = SQLAlchemy(app)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Car(db.Model):
    __tablename__ = 'cars'
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    records    = db.relationship(
        'MaintenanceRecord', backref='car', lazy=True,
        order_by='MaintenanceRecord.date, MaintenanceRecord.id',
        cascade='all, delete-orphan'
    )

    # ---- helpers ----

    def get_last_oil_change(self):
        return (
            MaintenanceRecord.query
            .filter_by(car_id=self.id, type='オイル交換')
            .filter(MaintenanceRecord.odometer.isnot(None))
            .order_by(MaintenanceRecord.date.desc(), MaintenanceRecord.id.desc())
            .first()
        )

    def get_max_odometer(self):
        r = (
            MaintenanceRecord.query
            .filter_by(car_id=self.id)
            .filter(MaintenanceRecord.odometer.isnot(None))
            .order_by(MaintenanceRecord.odometer.desc())
            .first()
        )
        return r.odometer if r else None

    def get_oil_change_distance(self):
        last_oil = self.get_last_oil_change()
        if not last_oil:
            return None
        current = self.get_max_odometer()
        if current is None:
            return None
        dist = current - last_oil.odometer
        return dist if dist >= 0 else None

    def get_fuel_records_for_chart(self):
        """Returns list of dicts for Chart.js (only 満タン records with calculated 燃費)."""
        fuel_recs = (
            MaintenanceRecord.query
            .filter_by(car_id=self.id, type='給油')
            .filter(MaintenanceRecord.odometer.isnot(None))
            .order_by(MaintenanceRecord.date.asc(), MaintenanceRecord.id.asc())
            .all()
        )
        result = []
        for r in fuel_recs:
            if r.fuel_efficiency is not None:
                result.append({
                    'date': r.date.strftime('%Y-%m-%d'),
                    'efficiency': r.fuel_efficiency,
                    'odometer': r.odometer,
                })
        return result


class MaintenanceRecord(db.Model):
    __tablename__ = 'maintenance_records'
    id                  = db.Column(db.Integer, primary_key=True)
    car_id              = db.Column(db.Integer, db.ForeignKey('cars.id'), nullable=False)
    date                = db.Column(db.Date, nullable=False)
    type                = db.Column(db.String(50), nullable=False)
    fuel_amount         = db.Column(db.Float)        # 給油量 (L)
    price               = db.Column(db.Integer)      # 料金 (円)
    odometer            = db.Column(db.Integer)      # メーター距離 (km)
    memo                = db.Column(db.Text)         # メモ
    summary             = db.Column(db.Text)         # 摘要
    fuel_status         = db.Column(db.String(10))   # 満タン / 非満タン
    fuel_efficiency     = db.Column(db.Float)        # 燃費 (km/L)
    oil_element_changed = db.Column(db.Boolean, default=False)
    save_path           = db.Column(db.String(500))  # データ保存先
    created_at          = db.Column(db.DateTime, default=datetime.now)
    photos              = db.relationship(
        'Photo', backref='record', lazy=True, cascade='all, delete-orphan'
    )

    def oil_distance_at_record(self):
        """Distance since last oil change as of this record's date."""
        if not self.odometer:
            return None
        last_oil = (
            MaintenanceRecord.query
            .filter_by(car_id=self.car_id, type='オイル交換')
            .filter(
                MaintenanceRecord.odometer.isnot(None),
                ((MaintenanceRecord.date < self.date) |
                 ((MaintenanceRecord.date == self.date) & (MaintenanceRecord.id < self.id)))
            )
            .order_by(MaintenanceRecord.date.desc(), MaintenanceRecord.id.desc())
            .first()
        )
        if not last_oil:
            return None
        dist = self.odometer - last_oil.odometer
        return dist if dist >= 0 else None


class Photo(db.Model):
    __tablename__ = 'photos'
    id            = db.Column(db.Integer, primary_key=True)
    record_id     = db.Column(db.Integer, db.ForeignKey('maintenance_records.id'), nullable=False)
    filename      = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255))
    created_at    = db.Column(db.DateTime, default=datetime.now)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def calculate_fuel_efficiency(car_id, record_id, odometer, fuel_amount, fuel_status):
    """
    Returns fuel efficiency (km/L) for a full-tank fill-up, or None.
    Efficiency = (current odometer − previous full-tank odometer) / current fuel amount.
    """
    if fuel_status != '満タン' or not odometer or not fuel_amount or fuel_amount <= 0:
        return None

    prev = (
        MaintenanceRecord.query
        .filter_by(car_id=car_id, type='給油', fuel_status='満タン')
        .filter(
            MaintenanceRecord.id != record_id,
            MaintenanceRecord.odometer.isnot(None),
        )
        .order_by(MaintenanceRecord.date.desc(), MaintenanceRecord.id.desc())
        .first()
    )
    if not prev or not prev.odometer:
        return None

    dist = odometer - prev.odometer
    if dist <= 0:
        return None
    return round(dist / fuel_amount, 2)


def save_photos(files, record_id):
    """Save uploaded photo files and return list of Photo objects."""
    photos = []
    upload_dir = app.config['UPLOAD_FOLDER']
    os.makedirs(upload_dir, exist_ok=True)
    for f in files:
        if f and f.filename and allowed_file(f.filename):
            ext = f.filename.rsplit('.', 1)[1].lower()
            unique_name = f"{uuid.uuid4().hex}.{ext}"
            f.save(os.path.join(upload_dir, unique_name))
            photos.append(Photo(
                record_id=record_id,
                filename=unique_name,
                original_name=secure_filename(f.filename),
            ))
    return photos


# ---------------------------------------------------------------------------
# Routes – Cars
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    cars = Car.query.order_by(Car.created_at.asc()).all()
    return render_template('index.html', cars=cars)


@app.route('/cars/add', methods=['GET', 'POST'])
def add_car():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            flash('自動車名を入力してください。', 'danger')
            return render_template('add_car.html', car=None)
        car = Car(name=name)
        db.session.add(car)
        db.session.commit()
        flash(f'「{name}」を追加しました。', 'success')
        return redirect(url_for('car_detail', car_id=car.id))
    return render_template('add_car.html', car=None)


@app.route('/cars/<int:car_id>/edit', methods=['GET', 'POST'])
def edit_car(car_id):
    car = Car.query.get_or_404(car_id)
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            flash('自動車名を入力してください。', 'danger')
            return render_template('add_car.html', car=car)
        car.name = name
        db.session.commit()
        flash('自動車名を更新しました。', 'success')
        return redirect(url_for('car_detail', car_id=car.id))
    return render_template('add_car.html', car=car)


@app.route('/cars/<int:car_id>/delete', methods=['POST'])
def delete_car(car_id):
    car = Car.query.get_or_404(car_id)
    name = car.name
    # Remove uploaded photos from disk
    for rec in car.records:
        for photo in rec.photos:
            path = os.path.join(app.config['UPLOAD_FOLDER'], photo.filename)
            if os.path.exists(path):
                os.remove(path)
    db.session.delete(car)
    db.session.commit()
    flash(f'「{name}」を削除しました。', 'warning')
    return redirect(url_for('index'))


@app.route('/cars/<int:car_id>')
def car_detail(car_id):
    car = Car.query.get_or_404(car_id)
    records = (
        MaintenanceRecord.query
        .filter_by(car_id=car_id)
        .order_by(MaintenanceRecord.date.desc(), MaintenanceRecord.id.desc())
        .all()
    )
    oil_distance  = car.get_oil_change_distance()
    last_oil      = car.get_last_oil_change()
    chart_data    = car.get_fuel_records_for_chart()
    all_cars      = Car.query.order_by(Car.created_at.asc()).all()

    # Latest fuel efficiency (last record with a value)
    latest_efficiency = None
    for r in records:
        if r.fuel_efficiency is not None:
            latest_efficiency = r.fuel_efficiency
            break

    return render_template(
        'car_detail.html',
        car=car,
        records=records,
        oil_distance=oil_distance,
        last_oil=last_oil,
        chart_data=chart_data,
        latest_efficiency=latest_efficiency,
        all_cars=all_cars,
        maintenance_types=MAINTENANCE_TYPES,
    )


# ---------------------------------------------------------------------------
# Routes – Records
# ---------------------------------------------------------------------------

@app.route('/cars/<int:car_id>/records/add', methods=['GET', 'POST'])
def add_record(car_id):
    car = Car.query.get_or_404(car_id)
    all_cars = Car.query.order_by(Car.created_at.asc()).all()

    if request.method == 'POST':
        rec_date_str  = request.form.get('date', '')
        rec_type      = request.form.get('type', '')
        fuel_amount   = request.form.get('fuel_amount') or None
        price         = request.form.get('price') or None
        odometer      = request.form.get('odometer') or None
        memo          = request.form.get('memo', '').strip() or None
        summary       = request.form.get('summary', '').strip() or None
        fuel_status   = request.form.get('fuel_status') or None
        oil_element   = request.form.get('oil_element_changed') == '1'
        save_path     = request.form.get('save_path', '').strip() or None

        if not rec_date_str or not rec_type:
            flash('整備年月日と整備種別は必須です。', 'danger')
            return render_template(
                'add_record.html', car=car, all_cars=all_cars,
                maintenance_types=MAINTENANCE_TYPES, record=None,
                today=date.today().isoformat()
            )

        try:
            rec_date = datetime.strptime(rec_date_str, '%Y-%m-%d').date()
        except ValueError:
            flash('日付の形式が正しくありません。', 'danger')
            return render_template(
                'add_record.html', car=car, all_cars=all_cars,
                maintenance_types=MAINTENANCE_TYPES, record=None,
                today=date.today().isoformat()
            )

        fuel_amount_f = float(fuel_amount) if fuel_amount else None
        price_i       = int(price)         if price       else None
        odometer_i    = int(odometer)      if odometer    else None

        record = MaintenanceRecord(
            car_id              = car_id,
            date                = rec_date,
            type                = rec_type,
            fuel_amount         = fuel_amount_f,
            price               = price_i,
            odometer            = odometer_i,
            memo                = memo,
            summary             = summary,
            fuel_status         = fuel_status,
            oil_element_changed = oil_element,
            save_path           = save_path,
        )
        db.session.add(record)
        db.session.flush()  # get record.id before commit

        # Calculate fuel efficiency
        if rec_type == '給油' and fuel_status and odometer_i and fuel_amount_f:
            record.fuel_efficiency = calculate_fuel_efficiency(
                car_id, record.id, odometer_i, fuel_amount_f, fuel_status
            )

        # Save photos
        files = request.files.getlist('photos')
        for photo in save_photos(files, record.id):
            db.session.add(photo)

        db.session.commit()
        flash('整備記録を追加しました。', 'success')
        return redirect(url_for('car_detail', car_id=car_id))

    return render_template(
        'add_record.html', car=car, all_cars=all_cars,
        maintenance_types=MAINTENANCE_TYPES, record=None,
        today=date.today().isoformat()
    )


@app.route('/cars/<int:car_id>/records/<int:record_id>/edit', methods=['GET', 'POST'])
def edit_record(car_id, record_id):
    car    = Car.query.get_or_404(car_id)
    record = MaintenanceRecord.query.filter_by(id=record_id, car_id=car_id).first_or_404()
    all_cars = Car.query.order_by(Car.created_at.asc()).all()

    if request.method == 'POST':
        rec_date_str  = request.form.get('date', '')
        rec_type      = request.form.get('type', '')
        fuel_amount   = request.form.get('fuel_amount') or None
        price         = request.form.get('price') or None
        odometer      = request.form.get('odometer') or None
        memo          = request.form.get('memo', '').strip() or None
        summary       = request.form.get('summary', '').strip() or None
        fuel_status   = request.form.get('fuel_status') or None
        oil_element   = request.form.get('oil_element_changed') == '1'
        save_path     = request.form.get('save_path', '').strip() or None

        if not rec_date_str or not rec_type:
            flash('整備年月日と整備種別は必須です。', 'danger')
            return render_template(
                'add_record.html', car=car, all_cars=all_cars,
                maintenance_types=MAINTENANCE_TYPES, record=record,
                today=date.today().isoformat()
            )

        try:
            record.date = datetime.strptime(rec_date_str, '%Y-%m-%d').date()
        except ValueError:
            flash('日付の形式が正しくありません。', 'danger')
            return render_template(
                'add_record.html', car=car, all_cars=all_cars,
                maintenance_types=MAINTENANCE_TYPES, record=record,
                today=date.today().isoformat()
            )

        record.type                = rec_type
        record.fuel_amount         = float(fuel_amount) if fuel_amount else None
        record.price               = int(price)         if price       else None
        record.odometer            = int(odometer)      if odometer    else None
        record.memo                = memo
        record.summary             = summary
        record.fuel_status         = fuel_status
        record.oil_element_changed = oil_element
        record.save_path           = save_path

        # Recalculate fuel efficiency
        if rec_type == '給油' and fuel_status and record.odometer and record.fuel_amount:
            record.fuel_efficiency = calculate_fuel_efficiency(
                car_id, record.id, record.odometer, record.fuel_amount, fuel_status
            )
        else:
            record.fuel_efficiency = None

        # Delete selected photos
        delete_ids = request.form.getlist('delete_photos')
        for pid in delete_ids:
            photo = Photo.query.get(int(pid))
            if photo and photo.record_id == record_id:
                path = os.path.join(app.config['UPLOAD_FOLDER'], photo.filename)
                if os.path.exists(path):
                    os.remove(path)
                db.session.delete(photo)

        # Add new photos
        files = request.files.getlist('photos')
        for photo in save_photos(files, record.id):
            db.session.add(photo)

        db.session.commit()
        flash('整備記録を更新しました。', 'success')
        return redirect(url_for('car_detail', car_id=car_id))

    return render_template(
        'add_record.html', car=car, all_cars=all_cars,
        maintenance_types=MAINTENANCE_TYPES, record=record,
        today=date.today().isoformat()
    )


@app.route('/cars/<int:car_id>/records/<int:record_id>/delete', methods=['POST'])
def delete_record(car_id, record_id):
    record = MaintenanceRecord.query.filter_by(id=record_id, car_id=car_id).first_or_404()
    for photo in record.photos:
        path = os.path.join(app.config['UPLOAD_FOLDER'], photo.filename)
        if os.path.exists(path):
            os.remove(path)
    db.session.delete(record)
    db.session.commit()
    flash('整備記録を削除しました。', 'warning')
    return redirect(url_for('car_detail', car_id=car_id))


# ---------------------------------------------------------------------------
# Photo serving
# ---------------------------------------------------------------------------

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------

THIN = Side(border_style='thin', color='AAAAAA')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HEADER_FILL = PatternFill(start_color='1F5C99', end_color='1F5C99', fill_type='solid')
ALT_FILL    = PatternFill(start_color='EAF2FF', end_color='EAF2FF', fill_type='solid')
HEADER_FONT = Font(color='FFFFFF', bold=True, size=10)
TITLE_FONT  = Font(bold=True, size=14, color='1F5C99')

COLUMNS = [
    ('整備年月日', 12),
    ('整備種別', 12),
    ('給油量(L)', 10),
    ('料金(円)', 10),
    ('メーター(km)', 13),
    ('燃費(km/L)', 11),
    ('給油状態', 10),
    ('オイル交換距離(km)', 18),
    ('エレメント交換', 14),
    ('摘要', 25),
    ('メモ', 30),
    ('データ保存先', 30),
]


def _write_car_sheet(wb, car):
    ws = wb.create_sheet(title=car.name[:30])

    # Title row
    ws.merge_cells('A1:L1')
    ws['A1'] = f'【{car.name}】 整備記録'
    ws['A1'].font      = TITLE_FONT
    ws['A1'].alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[1].height = 24

    # Header row
    for col_idx, (col_name, col_width) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=2, column=col_idx, value=col_name)
        cell.font      = HEADER_FONT
        cell.fill      = HEADER_FILL
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border    = BORDER
        ws.column_dimensions[get_column_letter(col_idx)].width = col_width
    ws.row_dimensions[2].height = 24

    records = (
        MaintenanceRecord.query
        .filter_by(car_id=car.id)
        .order_by(MaintenanceRecord.date.asc(), MaintenanceRecord.id.asc())
        .all()
    )

    for row_idx, rec in enumerate(records, start=3):
        fill = ALT_FILL if row_idx % 2 == 0 else None
        values = [
            rec.date.strftime('%Y/%m/%d') if rec.date else '',
            rec.type or '',
            rec.fuel_amount or '',
            rec.price or '',
            rec.odometer or '',
            rec.fuel_efficiency or '',
            rec.fuel_status or '',
            rec.oil_distance_at_record() or '',
            'あり' if rec.oil_element_changed else '',
            rec.summary or '',
            rec.memo or '',
            rec.save_path or '',
        ]
        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border    = BORDER
            cell.alignment = Alignment(vertical='center')
            if fill:
                cell.fill = fill
        ws.row_dimensions[row_idx].height = 18

    # Freeze header rows
    ws.freeze_panes = 'A3'

    # Fuel efficiency chart (only if data exists)
    efficiency_rows = [
        (i + 3, rec.fuel_efficiency)
        for i, rec in enumerate(records)
        if rec.fuel_efficiency is not None
    ]

    if len(efficiency_rows) >= 2:
        chart_start_row = len(records) + 5
        chart = LineChart()
        chart.title    = f'{car.name} 燃費推移'
        chart.style    = 10
        chart.y_axis.title = '燃費 (km/L)'
        chart.x_axis.title = '記録順'
        chart.width    = 20
        chart.height   = 12

        # Write chart data to a hidden area
        ws.cell(row=chart_start_row, column=1, value='燃費データ').font = Font(color='FFFFFF', size=1)
        ws.cell(row=chart_start_row, column=2, value='燃費(km/L)').font = Font(color='FFFFFF', size=1)
        for offset, (_, eff) in enumerate(efficiency_rows):
            ws.cell(row=chart_start_row + 1 + offset, column=1, value=offset + 1)
            ws.cell(row=chart_start_row + 1 + offset, column=2, value=eff)

        data_ref  = Reference(ws, min_col=2, min_row=chart_start_row,
                              max_row=chart_start_row + len(efficiency_rows))
        chart.add_data(data_ref, titles_from_data=True)
        chart.series[0].graphicalProperties.line.solidFill = '1F5C99'
        chart.series[0].marker.symbol = 'circle'
        chart.series[0].marker.size   = 5

        ws.add_chart(chart, f'N3')

    return ws


@app.route('/cars/<int:car_id>/export')
def export_car(car_id):
    car = Car.query.get_or_404(car_id)
    wb = openpyxl.Workbook()
    # Remove default sheet
    if 'Sheet' in wb.sheetnames:
        del wb['Sheet']
    _write_car_sheet(wb, car)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f'{car.name}_整備記録_{date.today().strftime("%Y%m%d")}.xlsx'
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


@app.route('/export/all')
def export_all():
    cars = Car.query.order_by(Car.created_at.asc()).all()
    if not cars:
        flash('登録されている自動車がありません。', 'warning')
        return redirect(url_for('index'))

    wb = openpyxl.Workbook()
    if 'Sheet' in wb.sheetnames:
        del wb['Sheet']
    for car in cars:
        _write_car_sheet(wb, car)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f'全車両_整備記録_{date.today().strftime("%Y%m%d")}.xlsx'
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


# ---------------------------------------------------------------------------
# App entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True, port=5000)
