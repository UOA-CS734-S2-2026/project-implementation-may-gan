import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final user = session.user;
    final colors = DayliColors.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Column(
              children: [
                ListTile(
                  title: const Text('Name'),
                  trailing: Text(user?.name ?? ''),
                ),
                ListTile(
                  title: const Text('Email'),
                  trailing: Text(user?.email ?? ''),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Signing out removes your unsent draft from this device.',
            style: TextStyle(color: colors.foregroundSecondary),
          ),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('settings.signOut'),
            onPressed: session.signOut,
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}
