import 'package:flutter/material.dart';

import 'theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Text(
        'Dayli',
        style: Theme.of(context).textTheme.displaySmall?.copyWith(
          color: DayliColors.of(context).accent,
          fontStyle: FontStyle.italic,
        ),
      ),
    ),
  );
}
