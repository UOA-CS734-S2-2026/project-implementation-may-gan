import 'package:dayli_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows the app name', (tester) async {
    await tester.pumpWidget(const DayliApp());
    expect(find.text('Dayli'), findsOneWidget);
  });
}
