import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;

import 'api_failure.dart';
import 'posting_day_client.dart' show failureForStatus;

class FriendCard {
  const FriendCard({
    required this.id,
    required this.username,
    required this.displayName,
    required this.relationship,
  });
  final String id;
  final String username;
  final String displayName;
  final String relationship;
}

class FriendRequest {
  const FriendRequest({
    required this.id,
    required this.senderId,
    required this.recipientId,
    required this.user,
  });
  final String id;
  final String senderId;
  final String recipientId;
  final FriendCard? user;
}

class FriendPage {
  const FriendPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });
  final List<FriendCard> items;
  final String? nextCursor;
  final bool hasMore;
}

class FriendRequestPage {
  const FriendRequestPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });
  final List<FriendRequest> items;
  final String? nextCursor;
  final bool hasMore;
}

class FriendsSnapshot {
  const FriendsSnapshot({
    required this.friends,
    required this.incoming,
    required this.outgoing,
  });
  final FriendPage friends;
  final FriendRequestPage incoming;
  final FriendRequestPage outgoing;
}

abstract interface class FriendsClient {
  Future<ApiResult<FriendsSnapshot>> load();
  Future<ApiResult<FriendPage>> loadFriends({String? cursor});
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  });
  Future<ApiResult<FriendPage>> search(String query, {String? cursor});
  Future<ApiResult<FriendCard>> profile(String username);
  Future<ApiResult<void>> send(String userId);
  Future<ApiResult<void>> accept(String requestId);
  Future<ApiResult<void>> decline(String requestId);
  Future<ApiResult<void>> cancel(String requestId);
  Future<ApiResult<void>> remove(String userId);
}

class GeneratedFriendsClient implements FriendsClient {
  GeneratedFriendsClient({
    required String baseUrl,
    required this._bearerToken,
    this.onForbidden,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');
  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final void Function()? onForbidden;
  Future<generated.RelationshipsApi?> _api() async {
    final token = await _bearerToken();
    if (token == null) return null;
    final auth = generated.HttpBearerAuth()..accessToken = token;
    return generated.RelationshipsApi(
      generated.ApiClient(basePath: _baseUrl, authentication: auth),
    );
  }

  @override
  Future<ApiResult<FriendsSnapshot>> load() async {
    final values = await Future.wait([
      loadFriends(),
      loadRequests('incoming'),
      loadRequests('outgoing'),
    ]);
    if (values[0] case ApiError<FriendPage>(failure: final failure)) {
      return ApiError(failure);
    }
    if (values[1] case ApiError<FriendRequestPage>(failure: final failure)) {
      return ApiError(failure);
    }
    if (values[2] case ApiError<FriendRequestPage>(failure: final failure)) {
      return ApiError(failure);
    }
    return ApiSuccess(
      FriendsSnapshot(
        friends: (values[0] as ApiSuccess<FriendPage>).value,
        incoming: (values[1] as ApiSuccess<FriendRequestPage>).value,
        outgoing: (values[2] as ApiSuccess<FriendRequestPage>).value,
      ),
    );
  }

  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) => _read((
    api,
  ) async {
    final page = await api.relationshipsListFriends(cursor: cursor, limit: 20);
    return _friendPage(page);
  });
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) => _read((api) async {
    final page = await api.relationshipsListPendingRequests(
      direction: direction,
      cursor: cursor,
      limit: 20,
    );
    return _requestPage(page);
  });
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) => _read(
    (api) async => _friendPage(
      await api.relationshipsSearchUsers(query, cursor: cursor, limit: 20),
    ),
  );
  @override
  Future<ApiResult<FriendCard>> profile(String username) => _read((api) async {
    final profile = await api.relationshipsGetProfileByUsername(username);
    if (profile == null) throw const FormatException('empty profile');
    return FriendCard(
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      relationship: profile.relationship.name,
    );
  });
  @override
  Future<ApiResult<void>> send(String userId) => _write(
    (api) => api.relationshipsSendRequest(
      sendRelationshipRequest: generated.SendRelationshipRequest(
        recipientId: userId,
      ),
    ),
  );
  @override
  Future<ApiResult<void>> accept(String requestId) =>
      _write((api) => api.relationshipsAcceptRequest(requestId));
  @override
  Future<ApiResult<void>> decline(String requestId) =>
      _write((api) => api.relationshipsDeclineRequest(requestId));
  @override
  Future<ApiResult<void>> cancel(String requestId) =>
      _write((api) => api.relationshipsCancelRequest(requestId));
  @override
  Future<ApiResult<void>> remove(String userId) =>
      _write((api) => api.relationshipsRemoveFriendship(userId));
  Future<ApiResult<T>> _read<T>(
    Future<T> Function(generated.RelationshipsApi) operation,
  ) async {
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());
    try {
      return ApiSuccess(await operation(api));
    } on generated.ApiException catch (error) {
      return ApiError(
        failureForStatus(
          error.code,
          error.innerException,
          onForbidden: onForbidden,
        ),
      );
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }

  Future<ApiResult<void>> _write(
    Future<Object?> Function(generated.RelationshipsApi) operation,
  ) async {
    final result = await _read(operation);
    return switch (result) {
      ApiSuccess() => const ApiSuccess(null),
      ApiError(:final failure) => ApiError(failure),
    };
  }
}

FriendCard _card(generated.RelationshipUserCard card) => FriendCard(
  id: card.id,
  username: card.username,
  displayName: card.displayName,
  relationship: card.relationship.name,
);
FriendPage _friendPage(generated.RelationshipUserPage? page) => FriendPage(
  items: (page?.items ?? []).map(_card).toList(growable: false),
  nextCursor: page?.nextCursor,
  hasMore: page?.hasMore ?? false,
);
FriendRequestPage _requestPage(generated.PendingRequestPage? page) =>
    FriendRequestPage(
      items: (page?.items ?? [])
          .map(
            (item) => FriendRequest(
              id: item.id,
              senderId: item.senderId,
              recipientId: item.recipientId,
              user: item.user == null ? null : _card(item.user!),
            ),
          )
          .toList(growable: false),
      nextCursor: page?.nextCursor,
      hasMore: page?.hasMore ?? false,
    );
