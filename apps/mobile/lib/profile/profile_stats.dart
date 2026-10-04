import 'package:flutter/material.dart';

import '../api/profile_client.dart';
import '../app/theme.dart';

/// The original web app's streak colour (Tailwind orange-500).
const _streakOrange = Color(0xFFF97316);

/// Posts, friends, and the day streak, laid out as in the original web app.
/// Confirmed server values only; nothing here nudges anyone to post.
class ProfileStatsTile extends StatelessWidget {
  const ProfileStatsTile({
    super.key,
    required this.stats,
    required this.streak,
    this.onFriends,
    this.showToday = false,
    this.staleNote,
  });

  /// Null shows the streak on its own, as when only the cached streak is
  /// known offline.
  final ProfileStats? stats;
  final PostingStreak streak;

  /// Opens the friends list; only the owner gets one.
  final VoidCallback? onFriends;

  /// Owner only: whether today's post is in.
  final bool showToday;

  /// Set when these values may be out of date, saying when they were last
  /// confirmed. Today's mark is left out then, since the day may have moved on.
  final String? staleNote;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget stat(
      String key,
      int value,
      String label, {
      Color? color,
      String? detail,
      Widget? mark,
      String? spoken,
    }) => Semantics(
      key: Key('profile.stats.$key'),
      container: true,
      label: spoken ?? '$value $label',
      excludeSemantics: true,
      child: Column(
        children: [
          Text(
            '$value',
            style: DayliText.sans(
              context,
              size: DayliTextSize.xl,
              weight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            label,
            style: DayliText.sans(
              context,
              size: DayliTextSize.xs,
              color: colors.foregroundSecondary,
            ),
          ),
          if (detail != null)
            Text(
              detail,
              style: DayliText.sans(
                context,
                fontSize: 11,
                color: colors.foregroundTertiary,
              ),
            ),
          ?mark,
        ],
      ),
    );

    final stale = staleNote != null;
    final empty = streak.current == 0 && streak.longest == 0;
    final today = showToday && !stale;
    final spoken = [
      '${streak.current} Day streak',
      if (empty) 'no streak yet',
      if (today)
        streak.postedToday ? "today's post is in" : "today's post isn't in yet",
      if (stale) '$staleNote, may be out of date',
    ].join(', ');
    final streakStat = stat(
      'streak',
      streak.current,
      'Day streak',
      color: _streakOrange,
      detail: empty ? 'No streak yet' : null,
      spoken: spoken,
      mark: today && streak.postedToday
          ? Padding(
              key: const Key('profile.stats.today'),
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.check_circle,
                    size: 12,
                    color: _streakOrange,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    "Today's in",
                    style: DayliText.sans(
                      context,
                      fontSize: 11,
                      color: colors.foregroundSecondary,
                    ),
                  ),
                ],
              ),
            )
          : null,
    );

    final stats = this.stats;
    final friends = stats == null
        ? null
        : stat(
            'friends',
            stats.friends,
            stats.friends == 1 ? 'Friend' : 'Friends',
          );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.foreground.withValues(alpha: 0.05)),
        boxShadow: DayliShadows.md,
      ),
      child: Column(
        children: [
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 24,
            runSpacing: 12,
            children: [
              if (stats != null) ...[
                stat('posts', stats.posts, stats.posts == 1 ? 'Post' : 'Posts'),
                if (onFriends == null)
                  friends!
                else
                  GestureDetector(onTap: onFriends, child: friends),
                stat('loved', stats.loved, 'Loved'),
              ],
              streakStat,
            ],
          ),
          if (staleNote case final note?) ...[
            const SizedBox(height: 10),
            ExcludeSemantics(
              child: Row(
                key: const Key('profile.stats.stale'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.cloud_off,
                    size: 13,
                    color: colors.foregroundTertiary,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      '$note · may be out of date',
                      style: DayliText.sans(
                        context,
                        fontSize: 11,
                        color: colors.foregroundTertiary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
