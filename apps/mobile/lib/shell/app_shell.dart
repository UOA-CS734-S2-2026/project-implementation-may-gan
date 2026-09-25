import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/nav_icons.dart';
import '../ui/surfaces.dart';

/// WDCC's mobile layout: a floating menu button that opens the full-screen
/// navigation, over the dotted page background.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  bool _open = false;

  @override
  void didUpdateWidget(AppShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Like WDCC's MobileNavCloseListener: navigating closes the menu.
    if (oldWidget.location != widget.location) _open = false;
  }

  void _go(String location) {
    setState(() => _open = false);
    context.go(location);
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: colors.background,
      body: Stack(
        children: [
          DayliPage(
            child: Padding(
              padding: EdgeInsets.only(top: top),
              child: widget.child,
            ),
          ),
          if (_open)
            Positioned.fill(
              child: ColoredBox(
                color: colors.background,
                child: Padding(
                  padding: EdgeInsets.only(top: top + 72),
                  child: _NavContent(location: widget.location, onGo: _go),
                ),
              ),
            ),
          Positioned(
            top: top + 24,
            left: 24,
            child: _RoundIconButton(
              key: Key(_open ? 'shell.closeMenu' : 'shell.openMenu'),
              icon: _open ? NavIcons.close : NavIcons.menu,
              label: _open ? 'Close menu' : 'Open menu',
              onPressed: () => setState(() => _open = !_open),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.background,
            shape: BoxShape.circle,
            border: Border.all(color: colors.foreground.withValues(alpha: 0.1)),
            boxShadow: DayliShadows.md,
          ),
          child: SvgPicture.string(
            navIconSvg(icon),
            width: 24,
            height: 24,
            colorFilter: ColorFilter.mode(colors.foreground, BlendMode.srcIn),
          ),
        ),
      ),
    );
  }
}

/// WDCC's `Navbar` content: logo, new dayli, search, pages, and profile.
class _NavContent extends StatelessWidget {
  const _NavContent({required this.location, required this.onGo});

  final String location;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final user = AppScope.of(context).session.user;

    final upper = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: GestureDetector(
            onTap: () => onGo('/'),
            child: const DayliLogo(width: 138.67),
          ),
        ),
        const SizedBox(height: 32),
        const DayliDivider(),
        const SizedBox(height: 32),
        DayliButton(
          key: const Key('shell.newDayli'),
          label: 'new dayli',
          size: ButtonSize.lg,
          fullWidth: true,
          alignStart: true,
          onPressed: () => onGo('/post'),
          leading: Transform.rotate(
            angle: -12 * math.pi / 180,
            child: SvgPicture.string(
              navIconSvg(NavIcons.newDayli),
              width: 20,
              height: 20,
              colorFilter: ColorFilter.mode(
                colors.foregroundAccent,
                BlendMode.srcIn,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        const _NavSearch(),
        const SizedBox(height: 32),
        const DayliDivider(label: 'pages'),
        const SizedBox(height: 32),
        for (final (index, (path, icon, label)) in const [
          ('/', NavIcons.daylies, 'daylies'),
          ('/friends', NavIcons.friends, 'friends'),
          ('/me', NavIcons.myDays, 'my days'),
          ('/messages', NavIcons.messages, 'messages'),
        ].indexed) ...[
          if (index > 0) const SizedBox(height: 8),
          _NavLink(
            icon: icon,
            label: label,
            active: location == path,
            onTap: () => onGo(path),
          ),
        ],
      ],
    );

    final profile = user == null
        ? const SizedBox.shrink()
        : GestureDetector(
            key: const Key('shell.profile'),
            onTap: () => onGo('/settings'),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: colors.backgroundAccent,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.name,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.lg,
                          weight: FontWeight.w600,
                          tracking: DayliTracking.tight,
                        ),
                      ),
                      const SizedBox(height: 4),
                      // Accounts have no username until the profile API
                      // (#68); the email stands in for the handle.
                      Text(
                        user.email,
                        style: DayliText.sans(
                          context,
                          fontSize: 12,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );

    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: const EdgeInsets.all(40),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: math.max(0, constraints.maxHeight - 80),
          ),
          child: IntrinsicHeight(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                upper,
                const Spacer(),
                const SizedBox(height: 32),
                profile,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavLink extends StatelessWidget {
  const _NavLink({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final color = active ? colors.foreground : colors.foregroundSecondary;
    return GestureDetector(
      key: Key('shell.nav.$label'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Row(
        children: [
          SvgPicture.string(
            navIconSvg(icon),
            width: 30,
            height: 30,
            colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
          ),
          const SizedBox(width: 16),
          Text(
            label,
            // `text-[2.3rem]` keeps the body's 1.5 line height.
            style: DayliText.serif(
              context,
              fontSize: 36.8,
              tracking: DayliTracking.tight,
              color: color,
            ).copyWith(height: 1.5),
          ),
        ],
      ),
    );
  }
}

/// WDCC's `NavSearch`. User search arrives with the profile API (#68); until
/// then every search settles with no results.
class _NavSearch extends StatefulWidget {
  const _NavSearch();

  @override
  State<_NavSearch> createState() => _NavSearchState();
}

class _NavSearchState extends State<_NavSearch> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final style = DayliText.sans(context, size: DayliTextSize.sm);
    final none = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide.none,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: const Key('shell.search'),
          onChanged: (value) => setState(() => _query = value.trim()),
          style: style,
          cursorColor: colors.foreground,
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: colors.backgroundSecondary,
            hintText: 'search users…',
            hintStyle: style.copyWith(color: colors.foregroundTertiary),
            contentPadding: const EdgeInsets.fromLTRB(0, 12, 24, 12),
            prefixIcon: Padding(
              padding: const EdgeInsets.only(left: 24, right: 6),
              child: SvgPicture.asset(
                'assets/wdcc/searchicon.svg',
                width: 24,
                height: 24,
              ),
            ),
            prefixIconConstraints: const BoxConstraints(minWidth: 54),
            border: none,
            enabledBorder: none,
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.accent, width: 2),
            ),
          ),
        ),
        if (_query.length >= 2)
          Container(
            margin: const EdgeInsets.only(top: 4),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: colors.background,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: colors.foreground.withValues(alpha: 0.2),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                'no users found',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.xs,
                  color: colors.foregroundTertiary,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
