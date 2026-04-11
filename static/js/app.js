/**
 * 自動車整備記録 – Common JavaScript
 */

'use strict';

// Auto-dismiss flash messages after 4 seconds
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.alert.alert-success, .alert.alert-warning').forEach(el => {
    setTimeout(() => {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(el);
      if (bsAlert) bsAlert.close();
    }, 4000);
  });
});
