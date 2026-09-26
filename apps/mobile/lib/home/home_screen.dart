import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/posting_day_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../compose/deadline_countdown.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// Home: today's prompt with the time left to post, then yesterday's daylies.
/// The released friends feed arrives with #19 (and #20 on mobile); until then
/// the feed shows WDCC's empty-state messages.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.random});

  final Random? random;

  static const emptyMessages = [
    "No daylies from your friends yesterday... maybe today's the comeback?",
    'Nobody posted anything yesterday... how about today?',
    "There was radio silence yesterday... maybe we'll get some daylies today?",
    "The archive is looking a bit thin for yesterday. There's always today.",
    "Yesterday's daylies are looking a little light. Maybe everyone was busy?",
    "Silence is golden, but a dayli is better. Let's write today.",
    "Well, nothing yesterday. The bar for today's dayli is on the floor - it's on you!",
    'No posts from yesterday. How boring...',
    'An empty feed. Did you know you can add new friends by searching for their username?',
    'A day without a dayli is just... a day. Hopefully today\'s a bit better.',
    "Yesterday's pages are blank. Let's write today's chapter.",
    'Yesterday was just you, me, and the void between us.',
    "A quiet yesterday just leaves space for a big today :)",
    'Nobody posted yesterday. Find better friends ong fr.',
    "Your friends didn't post any daylies yesterday. Are they hiding something from you?",
    "Your friends were being nonchalant yesterday. There's always today!",
  ];

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final String _emptyMessage =
      HomeScreen.emptyMessages[(widget.random ?? Random()).nextInt(
        HomeScreen.emptyMessages.length,
      )];
  ApiResult<PostingDay>? _day;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_day == null) _load();
  }

  Future<void> _load() async {
    final services = AppScope.of(context);
    final result = await services.postingDays.current();
    if (!mounted) return;
    if (result case ApiError(failure: Unauthenticated())) {
      await services.session.sessionExpired();
      return;
    }
    setState(() => _day = result);
  }

  Future<void> _compose() async {
    await context.push('/post');
    if (mounted) await _load();
  }

  String _greeting(DateTime now) {
    final name = AppScope.of(context).session.user?.name.trim() ?? '';
    final first = name.isEmpty ? '' : ', ${name.split(' ').first}';
    final hour = now.hour;
    final part = hour < 12
        ? 'Good morning'
        : hour < 18
        ? 'Good afternoon'
        : 'Good evening';
    return '$part$first';
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final now = AppScope.of(context).clock().toLocal();
    return RefreshIndicator(
      color: colors.foregroundAccent,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            _greeting(now),
            style: DayliText.serif(
              context,
              fontSize: 30,
              weight: FontWeight.w600,
              tracking: DayliTracking.tighter,
            ),
          ),
          const SizedBox(height: 20),
          _TodayCard(day: _day, onCompose: _compose, onRetry: _load),
          const SizedBox(height: 36),
          Text(
            "yesterday's daylies",
            style: DayliText.serif(
              context,
              size: DayliTextSize.xl,
              weight: FontWeight.w600,
              tracking: DayliTracking.tight,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            "Your friends' daylies unlock after midnight.",
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.foregroundSecondary,
            ),
          ),
          const SizedBox(height: 40),
          Opacity(
            opacity: 0.5,
            child: SvgPicture.asset('assets/wdcc/squiggle02.svg', height: 28),
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              _emptyMessage,
              key: const Key('home.empty'),
              textAlign: TextAlign.center,
              style: DayliText.serif(
                context,
                size: DayliTextSize.lg,
                weight: FontWeight.w500,
                tracking: DayliTracking.tight,
                color: colors.foregroundSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({
    required this.day,
    required this.onCompose,
    required this.onRetry,
  });

  final ApiResult<PostingDay>? day;
  final VoidCallback onCompose;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final label = Text(
      "today's prompt",
      style: DayliText.sans(
        context,
        size: DayliTextSize.sm,
        weight: FontWeight.w500,
        color: colors.foregroundTertiary,
      ),
    );

    final Widget content = switch (day) {
      null => const SizedBox(
        height: 120,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      ApiError(:final failure) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          label,
          const SizedBox(height: 8),
          Text(
            failure is NetworkUnavailable
                ? "You're offline, so today's prompt couldn't load."
                : "Today's prompt couldn't be loaded.",
            style: DayliText.serif(
              context,
              size: DayliTextSize.xl,
              weight: FontWeight.w600,
              tracking: DayliTracking.tight,
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: DayliButton(
                  label: 'Try again',
                  color: ButtonColor.foreground,
                  fullWidth: true,
                  height: 48,
                  onPressed: onRetry,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DayliButton(
                  label: 'Open draft',
                  fullWidth: true,
                  height: 48,
                  onPressed: onCompose,
                ),
              ),
            ],
          ),
        ],
      ),
      ApiSuccess(value: final today) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              label,
              const Spacer(),
              if (!today.hasPosted)
                DeadlineCountdown(
                  deadlineAt: today.deadlineAt,
                  serverNow: today.serverNow,
                  compact: true,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            today.promptText,
            style: DayliText.serif(
              context,
              fontSize: 26,
              weight: FontWeight.w600,
              tracking: DayliTracking.tighter,
            ).copyWith(height: 1.2),
          ),
          const SizedBox(height: 20),
          if (today.hasPosted)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.backgroundAccent,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    color: colors.foregroundAccent,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      "You've posted today's dayli. See you tomorrow.",
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        weight: FontWeight.w500,
                        color: colors.foregroundAccent,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            DayliButton(
              key: const Key('today.compose'),
              label: 'Post your dayli',
              weight: ButtonWeight.primary,
              size: ButtonSize.lg,
              fullWidth: true,
              height: 52,
              arrow: true,
              onPressed: onCompose,
            ),
        ],
      ),
    };

    return DayliCard(
      padding: const EdgeInsets.all(20),
      radius: 20,
      child: content,
    );
  }
}
