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
