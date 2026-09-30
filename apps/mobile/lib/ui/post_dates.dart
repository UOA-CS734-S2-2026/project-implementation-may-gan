/// Labels for a post's Auckland `YYYY-MM-DD` day, shown as written rather
/// than converted to the device's time zone.
library;

const _months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const _weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

DateTime? _parse(String localDate) {
  final parts = localDate.split('-');
  if (parts.length != 3) return null;
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return DateTime.utc(year, month, day);
}

/// `2026-09-29` as `29 Sep`.
String shortDayLabel(String localDate) {
  final date = _parse(localDate);
  if (date == null) return localDate;
  return '${date.day} ${_months[date.month - 1].substring(0, 3)}';
}

/// `2026-09-29` as `Tuesday, 29 September 2026`.
String longDayLabel(String localDate) {
  final date = _parse(localDate);
  if (date == null) return localDate;
  return '${_weekdays[date.weekday - 1]}, ${date.day} '
      '${_months[date.month - 1]} ${date.year}';
}
