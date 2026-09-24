import '../api/api_failure.dart';
import '../drafts/daily_post_draft.dart';

/// Why the server refused to accept a draft.
enum SubmissionConflict {
  /// The draft's Auckland day ended before the server accepted it.
  postingDayClosed,

  /// The draft is dated after the server's current day.
  postingDayNotOpen,

  /// The prompt no longer matches the day's prompt.
  promptChanged,

  /// The author already has a post for the day.
  alreadyPosted,

  /// The idempotency key was already used for a different submission.
  idempotencyKeyReused,
}

sealed class SubmissionResult {
  const SubmissionResult();
}

class SubmissionAccepted extends SubmissionResult {
  const SubmissionAccepted({required this.postId, required this.replayed});

  final String postId;

  /// True when the server replayed an earlier accepted attempt.
  final bool replayed;
}

class SubmissionRejected extends SubmissionResult {
  const SubmissionRejected(this.conflict);

  final SubmissionConflict conflict;
}

class SubmissionFailed extends SubmissionResult {
  const SubmissionFailed(this.failure);

  final ApiFailure failure;
}

/// Submits a draft with its idempotency key. Retrying the same draft must
/// reuse the key so a lost response cannot create a second post.
abstract interface class DailyPostSubmitter {
  Future<SubmissionResult> submit(DailyPostDraft draft);
}

/// Used until the create-post client (#16) is available to the app. It never
/// contacts the server, so drafts are always retained.
class UnavailablePostSubmitter implements DailyPostSubmitter {
  const UnavailablePostSubmitter();

  @override
  Future<SubmissionResult> submit(DailyPostDraft draft) async =>
      const SubmissionFailed(ServiceUnavailable());
}
