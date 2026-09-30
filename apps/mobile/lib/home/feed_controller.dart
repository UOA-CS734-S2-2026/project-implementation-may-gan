import '../api/feed_client.dart';
import '../posts/post_pager.dart';

/// The friends feed, newest day first.
class FeedController extends PostPager<FeedPost> {
  FeedController(FeedClient client) : super(client.page, (post) => post.id);
}
