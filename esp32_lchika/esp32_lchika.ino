/*
 * ESP32 Lチカ (LED Blink) プログラム
 *
 * 内蔵LEDを1秒間隔で点滅させます。
 * ESP32の内蔵LEDは通常GPIO2に接続されています。
 */

// 内蔵LEDのピン番号 (ESP32は通常GPIO2)
const int LED_PIN = 2;

// 点滅間隔 (ミリ秒)
const int BLINK_INTERVAL = 1000;

void setup() {
  // シリアル通信の初期化 (デバッグ用)
  Serial.begin(115200);
  Serial.println("ESP32 Lチカ スタート");

  // LEDピンを出力モードに設定
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // LEDを点灯
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(BLINK_INTERVAL);

  // LEDを消灯
  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(BLINK_INTERVAL);
}
