import 'package:flutter/material.dart';

import '../ui/surfaces.dart';
import 'theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: DayliColors.of(context).background,
    body: const DayliPage(
      tilted: true,
      child: Center(child: DayliLogo(width: 250)),
    ),
  );
}
