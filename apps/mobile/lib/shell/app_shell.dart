import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/nav_icons.dart';
import '../ui/surfaces.dart';

/// The signed-in frame: a slim top bar with the logo and profile, the page,
/// and a bottom tab bar with the "new dayli" action in the thumb zone.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  static const tabs = [
    ('/', NavIcons.daylies, 'daylies'),
    ('/friends', NavIcons.friends, 'friends'),
    ('/me', NavIcons.myDays, 'my days'),
    ('/messages', NavIcons.messages, 'messages'),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: DayliPage(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const _TopBar(),
              Expanded(child: child),
            ],
          ),
        ),
      ),
      bottomNavigationBar: AnimatedBuilder(
        animation: AppScope.of(context).messaging,
        builder: (context, _) => _BottomBar(
          location: location,
          unreadMessages: AppScope.of(context).messaging.unreadTotal,
          onTab: (path) => context.go(path),
          onNewDayli: () => context.push('/post'),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final user = AppScope.of(context).session.user;
    final initial = (user?.name.trim().isNotEmpty ?? false)
        ? user!.name.trim()[0].toUpperCase()
        : '?';
    return SizedBox(
      height: 64,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(
          children: [
            const DayliLogo(width: 84),
            const Spacer(),
            Semantics(
              button: true,
              label: 'Profile and settings',
              child: InkResponse(
                key: const Key('shell.profile'),
                radius: 28,
                onTap: () => context.push('/settings'),
                child: Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.backgroundAccent,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    initial,
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.lg,
                      weight: FontWeight.w600,
                      color: colors.foregroundAccent,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.location,
    required this.unreadMessages,
    required this.onTab,
    required this.onNewDayli,
  });

  final String location;
  final int unreadMessages;
  final ValueChanged<String> onTab;
  final VoidCallback onNewDayli;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget tab((String, String, String) entry) => Expanded(
      child: _Tab(
        icon: entry.$2,
        label: entry.$3,
        active:
            location == entry.$1 ||
            (entry.$1 == '/messages' && location.startsWith('/messages/')),
        onTap: () => onTab(entry.$1),
        badge: entry.$1 == '/messages' ? unreadMessages : 0,
      ),
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.card,
        border: Border(
          top: BorderSide(color: colors.foreground.withValues(alpha: 0.06)),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 16,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            children: [
              tab(AppShell.tabs[0]),
              tab(AppShell.tabs[1]),
              Expanded(child: _NewDayliButton(onTap: onNewDayli)),
              tab(AppShell.tabs[2]),
              tab(AppShell.tabs[3]),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
    required this.badge,
  });

  final String icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final color = active ? colors.foregroundAccent : colors.foregroundSecondary;
    return Semantics(
      button: true,
      selected: active,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        key: Key('shell.nav.$label'),
        onTap: onTap,
        radius: 36,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 52,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active ? colors.backgroundAccent : Colors.transparent,
                borderRadius: BorderRadius.circular(15),
              ),
              child: badge == 0
                  ? SvgPicture.string(
                      navIconSvg(icon),
                      width: 22,
                      height: 22,
                      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
                    )
                  : Badge(
                      label: Text('$badge'),
                      child: SvgPicture.string(
                        navIconSvg(icon),
                        width: 22,
                        height: 22,
                        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
                      ),
                    ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              style: DayliText.serif(
                context,
                fontSize: 13,
                weight: active ? FontWeight.w600 : FontWeight.w400,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewDayliButton extends StatelessWidget {
  const _NewDayliButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Center(
      child: Semantics(
        button: true,
        label: 'new dayli',
        excludeSemantics: true,
        child: Material(
          color: colors.foregroundAccent,
          borderRadius: BorderRadius.circular(18),
          elevation: 0,
          child: InkWell(
            key: const Key('shell.newDayli'),
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: SizedBox(
              width: 56,
              height: 48,
              child: Center(
                child: Transform.rotate(
                  angle: -12 * math.pi / 180,
                  child: SvgPicture.string(
                    navIconSvg(NavIcons.newDayli),
                    width: 24,
                    height: 24,
                    colorFilter: const ColorFilter.mode(
                      Colors.white,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
