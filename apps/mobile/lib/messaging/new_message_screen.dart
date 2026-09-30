import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';
import '../app/app_scope.dart';
import '../auth/session_controller.dart';
import '../app/theme.dart';

/// Route-backed draft. It never creates a blank conversation.
class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key, required this.username});
  final String username;
  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen> {
  final _text = TextEditingController();
  Future<ApiResult<FriendCard>>? _profile;
  Future<ApiResult<String?>>? _existing;
  String? _accountId;
  String? _loadedUsername;
  SessionController? _session;
  String? _intent;
  String? _clientMessageId;
  String? _sendError;
  bool _sending = false;
  bool _redirected = false;
  String? _authorizedRecipientId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (_session != session) {
      _session?.removeListener(_onSessionChanged);
      _session = session;
      _session!.addListener(_onSessionChanged);
    }
    _syncActor();
  }

  @override
  void didUpdateWidget(covariant NewMessageScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.username != widget.username) _syncActor();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncActor();
    setState(() {});
  }

  void _syncActor() {
    final accountId = _session?.user?.id;
    if (_profile == null ||
        _accountId != accountId ||
        _loadedUsername != widget.username) {
      _accountId = accountId;
      _loadedUsername = widget.username;
      _profile = _load();
      _existing = null;
      _intent = null;
      _clientMessageId = null;
      _sendError = null;
      _redirected = false;
      _authorizedRecipientId = null;
      _sending = false;
      _text.clear();
    }
  }

  Future<ApiResult<FriendCard>> _load() =>
      AppScope.of(context).friends.profile(widget.username);

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    _text.dispose();
    super.dispose();
  }

  Future<void> _send(FriendCard recipient) async {
    _syncActor();
    final accountAtStart = _accountId;
    if (accountAtStart != _session?.user?.id ||
        _authorizedRecipientId != recipient.id) {
      return;
    }
    final text = _text.text;
    if (_sending || text.trim().isEmpty) return;
    final intent = '${recipient.id}\u0000$text';
    if (_intent != intent) {
      _intent = intent;
      _clientMessageId = null;
    }
    setState(() {
      _sending = true;
      _sendError = null;
    });
    String? id;
    try {
      id = await AppScope.of(context).messaging.createDirect(
        recipient.id,
        text,
        clientMessageId: _clientMessageId ??= DateTime.now()
            .microsecondsSinceEpoch
            .toString(),
      );
    } catch (_) {
      id = null;
    }
    if (!mounted || accountAtStart != AppScope.of(context).session.user?.id) {
      return;
    }
    setState(() {
      _sending = false;
      _sendError = id == null ? 'Message could not be sent. Try again.' : null;
    });
    if (id != null) context.go('/messages/$id');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('new message')),
    body: FutureBuilder<ApiResult<FriendCard>>(
      key: ValueKey((_accountId, widget.username)),
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.data case ApiSuccess<FriendCard>(value: final person)) {
          _authorizedRecipientId = person.id;
          final accountAtLookup = _accountId;
          _existing ??= AppScope.of(context).messaging.findDirect(person.id);
          return FutureBuilder<ApiResult<String?>>(
            key: ValueKey(_existing),
            future: _existing,
            builder: (context, lookup) {
              final lookupResult = lookup.data;
              final existingId = lookupResult is ApiSuccess<String?>
                  ? lookupResult.value
                  : null;
              if (existingId != null &&
                  !_redirected &&
                  accountAtLookup == AppScope.of(context).session.user?.id) {
                _redirected = true;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted &&
                      accountAtLookup ==
                          AppScope.of(context).session.user?.id) {
                    context.go('/messages/$existingId');
                  }
                });
              }
              if (!lookup.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (lookupResult is ApiError<String?>) {
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Conversation lookup is unavailable.'),
                      TextButton(
                        onPressed: () {
                          if (accountAtLookup != _session?.user?.id) return;
                          setState(() {
                            _existing = AppScope.of(
                              context,
                            ).messaging.findDirect(person.id);
                          });
                        },
                        child: const Text('Retry lookup'),
                      ),
                    ],
                  ),
                );
              }
              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: DayliColors.of(context).card,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'private note to',
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                            color: DayliColors.of(context).foregroundTertiary,
                          ),
                        ),
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
                            size: DayliTextSize.sm,
                            color: DayliColors.of(context).foregroundTertiary,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Nothing is created until you send your first message.',
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.sm,
                          ),
                        ),
                        TextField(
                          controller: _text,
                          minLines: 3,
                          maxLines: 5,
                          maxLength: 4000,
                          enabled: !_sending,
                          onChanged: (_) {
                            if (_sendError != null) {
                              setState(() => _sendError = null);
                            }
                          },
                          decoration: const InputDecoration(
                            labelText: 'Message',
                          ),
                        ),
                        Align(
                          alignment: Alignment.centerRight,
                          child: FilledButton(
                            onPressed: _sending ? null : () => _send(person),
                            child: Text(_sending ? 'Sending…' : 'Send'),
                          ),
                        ),
                        if (_sendError != null)
                          Text(
                            _sendError!,
                            style: DayliText.sans(
                              context,
                              color: DayliColors.of(context).danger,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          );
        }
        return const Center(child: Text('This profile is unavailable.'));
      },
    ),
  );
}
