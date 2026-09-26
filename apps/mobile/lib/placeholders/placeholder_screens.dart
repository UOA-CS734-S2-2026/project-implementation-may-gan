import 'package:flutter/widgets.dart';

import '../ui/coming_soon.dart';
import '../ui/nav_icons.dart';

// Tabs whose REST APIs have not landed yet.

/// Friend lists return with the relationships UI (#46, #47).
class FriendsScreen extends StatelessWidget {
  const FriendsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'friends',
    icon: NavIcons.friends,
    message: 'Find friends and see who you share your daylies with.',
  );
}

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

/// Messaging returns with its REST API.
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'messages',
    icon: NavIcons.messages,
    message: 'Chat with friends about their daylies.',
  );
}
