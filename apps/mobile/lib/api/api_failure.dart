/// Transport-independent failures that screens branch on.
sealed class ApiFailure {
  const ApiFailure();
}

class Unauthenticated extends ApiFailure {
  const Unauthenticated();
}

class NetworkUnavailable extends ApiFailure {
  const NetworkUnavailable();
}

class ServiceUnavailable extends ApiFailure {
  const ServiceUnavailable();
}

/// Absent, or hidden from this user; the API does not say which.
class NotFound extends ApiFailure {
  const NotFound();
}

/// Too many requests; wait before trying again.
class RateLimited extends ApiFailure {
  const RateLimited();
}

/// Something short-lived, such as a media reservation or its upload URL,
/// ran out before it was used. Start again rather than retrying.
class Expired extends ApiFailure {
  const Expired();
}

class InvalidRequest extends ApiFailure {
  const InvalidRequest(this.message);

  final String message;
}

sealed class ApiResult<T> {
  const ApiResult();
}

class ApiSuccess<T> extends ApiResult<T> {
  const ApiSuccess(this.value);

  final T value;
}

class ApiError<T> extends ApiResult<T> {
  const ApiError(this.failure);

  final ApiFailure failure;
}
