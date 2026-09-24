import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/posting_day_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../compose/deadline_countdown.dart';

/// Today's prompt and posting status. The friends feed arrives with the
/// released-feed API (#19, #20).
class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key});

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  ApiResult<PostingDay>? _result;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_result == null) _load();
  }

  Future<void> _load() async {
    final services = AppScope.of(context);
    final result = await services.postingDays.current();
    if (!mounted) return;
    if (result case ApiError(failure: Unauthenticated())) {
      await services.session.sessionExpired();
      return;
    }
    setState(() => _result = result);
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final text = Theme.of(context).textTheme;
    final result = _result;

    return Scaffold(
      appBar: AppBar(title: const Text('daylies')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: switch (result) {
                  null => const Center(child: CircularProgressIndicator()),
                  ApiError() => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Today's prompt couldn't be loaded.",
                        style: text.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => context.push('/compose'),
                        child: const Text('Open your draft'),
                      ),
                    ],
                  ),
                  ApiSuccess(value: final day) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "today's prompt",
                        style: TextStyle(color: colors.foregroundTertiary),
                      ),
                      const SizedBox(height: 4),
                      Text(day.promptText, style: text.headlineMedium),
                      const SizedBox(height: 16),
                      if (day.hasPosted)
                        Text(
                          "You've posted today's dayli. Your friends will see it "
                          'after midnight.',
                          style: TextStyle(color: colors.foregroundSecondary),
                        )
                      else ...[
                        DeadlineCountdown(
                          deadlineAt: day.deadlineAt,
                          serverNow: day.serverNow,
                        ),
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          key: const Key('today.compose'),
                          onPressed: () async {
                            await context.push('/compose');
                            if (mounted) await _load();
                          },
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Post your dayli'),
                        ),
                      ],
                    ],
                  ),
                },
              ),
            ),
            const SizedBox(height: 48),
            Text(
              "Your friends' daylies will appear here after midnight.",
              textAlign: TextAlign.center,
              style: text.titleMedium?.copyWith(
                color: colors.foregroundSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
