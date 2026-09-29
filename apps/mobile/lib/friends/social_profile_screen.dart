import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';

/// A deliberately minimal social profile. No post, email, or provider data is rendered.
class SocialProfileScreen extends StatelessWidget {
  const SocialProfileScreen({super.key, required this.username});
  final String username;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('profile')),
    body: FutureBuilder(
      future: _profile(context),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final result = snapshot.data!;
        return switch (result) {
          ApiSuccess<FriendCard>(value: final person) => Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 48,
                    child: Text(
                      person.displayName.substring(0, 1).toUpperCase(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    person.displayName,
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xxl,
                      weight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '@${person.username}',
                    style: DayliText.sans(
                      context,
                      color: DayliColors.of(context).foregroundTertiary,
                    ),
                  ),
                  const SizedBox(height: 22),
                  if (person.relationship == 'none')
                    FilledButton(
                      onPressed: () =>
                          AppScope.of(context).friends.send(person.id),
                      child: const Text('add friend'),
                    ),
                  OutlinedButton(
                    onPressed: () => context.go(
                      '/messages?to=${Uri.encodeComponent(person.id)}&name=${Uri.encodeComponent(person.displayName)}',
                    ),
                    child: const Text('message'),
                  ),
                ],
              ),
            ),
          ),
          _ => const Center(child: Text('This profile is unavailable.')),
        };
      },
    ),
  );

  Future<ApiResult<FriendCard>> _profile(BuildContext context) {
    final client = AppScope.of(context).friends;
    if (client is GeneratedFriendsClient) return client.profile(username);
    return Future.value(const ApiError(ServiceUnavailable()));
  }
}
