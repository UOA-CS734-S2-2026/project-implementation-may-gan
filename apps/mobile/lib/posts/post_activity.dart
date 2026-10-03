import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/post_client.dart';
import '../api/post_media.dart';
import '../api/post_page.dart';
import '../drafts/daily_post_draft.dart';
import 'post_submitter.dart';

/// Tells screens that the signed-in user's own posts changed, such as after
/// the server accepts a new dayli or deletes one, so they can reload values
/// derived from them like the streak.
class PostActivity extends ChangeNotifier {
  void changed() => notifyListeners();
}

/// Reports each post the server accepts. It sits at the request layer, so the
/// signal goes out even if the composer has closed by the time it answers.
class ReportingPostSubmitter implements DailyPostSubmitter {
  ReportingPostSubmitter(this._inner, this._activity);

  final DailyPostSubmitter _inner;
  final PostActivity _activity;

  @override
  Future<SubmissionResult> submit(DailyPostDraft draft) async {
    final result = await _inner.submit(draft);
    if (result is SubmissionAccepted) _activity.changed();
    return result;
  }
}

/// Reports each delete the server confirms, whether or not the screen that
/// asked for it is still open.
class ReportingPostClient implements PostClient {
  ReportingPostClient(this._inner, this._activity);

  final PostClient _inner;
  final PostActivity _activity;

  @override
  Future<ApiResult<void>> delete(String postId) async {
    final result = await _inner.delete(postId);
    // Already gone counts as deleted.
    if (result case ApiSuccess() || ApiError(failure: NotFound())) {
      _activity.changed();
    }
    return result;
  }

  @override
  Future<ApiResult<PostDetail>> get(String postId) => _inner.get(postId);

  @override
  Future<ApiResult<ProfilePostsPage>> profilePage(
    String username, {
    String? cursor,
  }) => _inner.profilePage(username, cursor: cursor);

  @override
  Future<ApiResult<PostMedia>> media(String postId, String mediaId) =>
      _inner.media(postId, mediaId);

  @override
  Future<ApiResult<PostDetail>> update(String postId, PostEdit edit) =>
      _inner.update(postId, edit);

  @override
  Future<ApiResult<PostPage<PostRevision>>> revisions(
    String postId, {
    String? cursor,
  }) => _inner.revisions(postId, cursor: cursor);
}
