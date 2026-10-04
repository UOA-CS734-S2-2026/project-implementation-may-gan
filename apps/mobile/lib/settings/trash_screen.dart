import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../auth/session_controller.dart';

class TrashScreen extends StatefulWidget {
  const TrashScreen({super.key});

  @override
  State<TrashScreen> createState() => _TrashScreenState();
}

class _TrashScreenState extends State<TrashScreen> {
  List<TrashedPost>? _posts;
  ApiFailure? _failure;
  String? _restoring;
  int _request = 0;
  SessionController? _session;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = AppScope.of(context).session;
    if (!identical(_session, session)) {
      _session?.removeListener(_sessionChanged);
      _session = session..addListener(_sessionChanged);
      _load();
    }
  }

  @override
  void dispose() {
    _session?.removeListener(_sessionChanged);
    super.dispose();
  }

  void _sessionChanged() {
    _request++;
    if (_session?.status != SessionStatus.signedIn) {
      setState(() {
        _posts = null;
        _failure = null;
        _restoring = null;
      });
      if (mounted) Navigator.maybePop(context);
    }
  }

  bool _current(int request, int generation, String actor) =>
      mounted &&
      request == _request &&
      _session?.generation == generation &&
      _session?.user?.id == actor &&
      _session?.status == SessionStatus.signedIn;

  Future<void> _load() async {
    final session = _session;
    final actor = session?.user?.id;
    if (session == null ||
        actor == null ||
        session.status != SessionStatus.signedIn) {
      return;
    }
    final generation = session.generation;
    final request = ++_request;
    setState(() {
      _failure = null;
    });
    final result = await AppScope.of(context).postTrash.listTrash();
    if (!_current(request, generation, actor)) return;
    setState(() {
      switch (result) {
        case ApiSuccess(:final value):
          _posts = value;
        case ApiError(:final failure):
          _failure = failure;
      }
    });
  }

  Future<void> _restore(TrashedPost post) async {
    final session = _session!;
    final actor = session.user!.id;
    final generation = session.generation;
    final request = ++_request;
    setState(() {
      _restoring = post.id;
      _failure = null;
    });
    final result = await AppScope.of(context).postTrash.restore(post.id);
    if (!_current(request, generation, actor)) return;
    switch (result) {
      case ApiSuccess():
        setState(() {
          _posts = _posts?.where((item) => item.id != post.id).toList();
          _restoring = null;
        });
      case ApiError(:final failure):
        setState(() {
          _failure = failure;
          _restoring = null;
        });
    }
  }

  String _deadline(DateTime value) =>
      value.toLocal().toString().replaceFirst(RegExp(r':\d\d\.\d+$'), '');

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Trash')),
      backgroundColor: colors.background,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Posts can be restored for 7 days. Permanent cleanup starts 14 days after deletion.',
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.foregroundSecondary,
              ),
            ),
            if (_failure != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  _failure is Conflict
                      ? 'This day already has a replacement, so the original cannot be restored.'
                      : 'Trash could not be updated. Your posts have not been changed.',
                  key: const Key('trash.error'),
                  style: TextStyle(color: colors.danger),
                ),
              ),
            if (_posts == null && _failure == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_posts?.isEmpty == true)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: Text('Trash is empty.')),
              )
            else
              ...?_posts?.map((post) {
                final restorable =
                    !post.pendingCleanup &&
                    !AppScope.of(context).clock().isAfter(post.restoreUntil);
                return Card(
                  key: Key('trash.${post.id}.${post.generation}'),
                  child: ListTile(
                    title: Text('Dayli from ${post.localDate}'),
                    subtitle: Text(
                      'Restore by ${_deadline(post.restoreUntil)}\nPermanent cleanup due ${_deadline(post.purgeDueAt)}',
                    ),
                    isThreeLine: true,
                    trailing: TextButton(
                      onPressed: restorable && _restoring == null
                          ? () => _restore(post)
                          : null,
                      child: Text(
                        _restoring == post.id
                            ? 'Restoring...'
                            : restorable
                            ? 'Restore'
                            : 'Restore period ended',
                      ),
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
