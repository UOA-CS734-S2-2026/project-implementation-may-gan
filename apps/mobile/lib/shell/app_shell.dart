import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Bottom navigation for signed-in destinations. Friends, profile, and
/// messages join as their APIs land (#20, #68, #32).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: navigationShell,
    floatingActionButton: navigationShell.currentIndex == 0
        ? FloatingActionButton.extended(
            key: const Key('shell.newDayli'),
            onPressed: () => context.push('/compose'),
            icon: const Icon(Icons.add_a_photo_outlined),
            label: const Text('new dayli'),
          )
        : null,
    bottomNavigationBar: NavigationBar(
      selectedIndex: navigationShell.currentIndex,
      onDestinationSelected: (index) => navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      ),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.auto_awesome_outlined),
          label: 'daylies',
        ),
        NavigationDestination(
          icon: Icon(Icons.settings_outlined),
          label: 'settings',
        ),
      ],
    ),
  );
}
