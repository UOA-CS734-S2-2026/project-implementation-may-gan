import 'package:flutter/widgets.dart';

import '../ui/coming_soon.dart';
import '../ui/nav_icons.dart';

// Tabs whose REST APIs have not landed yet.

/// Profiles and past daylies return with the profile API (#68).
class MyDaysScreen extends StatelessWidget {
  const MyDaysScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'my days',
    icon: NavIcons.myDays,
    message: 'Every dayli you post will be kept here, one day at a time.',
  );
}
