import 'package:flutter/material.dart';

void main() => runApp(const DayliApp());

class DayliApp extends StatelessWidget {
  const DayliApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Dayli',
    home: const Scaffold(body: Center(child: Text('Dayli'))),
  );
}
