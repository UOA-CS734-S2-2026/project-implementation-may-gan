import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import '../drafts/daily_post_draft.dart';

/// Why the camera couldn't be used. Posting never depends on it: the library
/// is always still there.
enum CaptureFailure {
  /// The author declined the prompt. They can be asked again, on Android.
  denied,

  /// The prompt won't appear again; only the system Settings can turn it on.
  permanentlyDenied,

  /// A device policy, such as parental controls, forbids the camera.
  restricted,

  /// There is no camera to open, as on a simulator or a device without one.
  unavailable,
}

/// How a camera capture ended.
sealed class CaptureOutcome {
  const CaptureOutcome();
}

final class Captured extends CaptureOutcome {
  const Captured(this.attachment);

  final DraftAttachment attachment;
}

/// The author closed the camera without taking anything.
final class CaptureCancelled extends CaptureOutcome {
  const CaptureCancelled();
}

final class CaptureFailed extends CaptureOutcome {
  const CaptureFailed(this.reason);

  final CaptureFailure reason;
}

/// Chooses photos and videos for a dayli. Media stays on the device until the
/// media upload API lands; only the draft keeps a reference to it.
abstract interface class MediaPicker {
  /// The first slot takes a photo or a video.
  Future<DraftAttachment?> pickPhotoOrVideo();

  /// Later slots take photos only.
  Future<DraftAttachment?> pickPhoto();

  /// Takes a photo with the camera. Asks for camera access the first time.
  Future<CaptureOutcome> capturePhoto();

  /// Records a video with the camera, stopping at the video length limit.
  Future<CaptureOutcome> captureVideo();

  /// A photo or video the system finished taking after Android ended the app
  /// mid-capture, or null. Returned once.
  Future<DraftAttachment?> recoverLostCapture();

  /// Opens this app's page in the system Settings. False when it can't.
  Future<bool> openSettings();
}

/// Camera access, apart from the camera itself so tests can script it.
abstract interface class CameraPermission {
  Future<PermissionStatus> status();
  Future<PermissionStatus> request();
  Future<bool> openSettings();
}

class DeviceCameraPermission implements CameraPermission {
  const DeviceCameraPermission();

  @override
  Future<PermissionStatus> status() => Permission.camera.status;

  @override
  Future<PermissionStatus> request() => Permission.camera.request();

  @override
  Future<bool> openSettings() => openAppSettings();
}

class DeviceMediaPicker implements MediaPicker {
  const DeviceMediaPicker({this.camera = const DeviceCameraPermission()});

  final CameraPermission camera;

  static const _videoExtensions = {'mp4', 'mov', 'webm', 'm4v', '3gp', 'mkv'};

  /// The camera stops here. A little under the 15 second limit, because a clip
  /// stopped at exactly 15 seconds can be written a few milliseconds long, and
  /// the compressor rejects anything over.
  static const _recordingMax = Duration(milliseconds: 14500);

  @override
  Future<DraftAttachment?> pickPhotoOrVideo() async =>
      _attachment(await ImagePicker().pickMedia());

  @override
  Future<DraftAttachment?> pickPhoto() async =>
      _attachment(await ImagePicker().pickImage(source: ImageSource.gallery));

  @override
  Future<CaptureOutcome> capturePhoto() => _capture(
    // The full-metadata flag would ask for photo-library access on iOS, which
    // taking a photo doesn't need.
    () => ImagePicker().pickImage(
      source: ImageSource.camera,
      requestFullMetadata: false,
    ),
    'image',
  );

  @override
  Future<CaptureOutcome> captureVideo() => _capture(
    () => ImagePicker().pickVideo(
      source: ImageSource.camera,
      maxDuration: _recordingMax,
    ),
    'video',
  );

  @override
  Future<DraftAttachment?> recoverLostCapture() async {
    final lost = await ImagePicker().retrieveLostData();
    if (lost.isEmpty) return null;
    final file = lost.file ?? lost.files?.firstOrNull;
    if (file == null) return null;
    return switch (lost.type) {
      RetrieveType.video => DraftAttachment(
        localPath: file.path,
        mediaType: 'video',
      ),
      RetrieveType.image => DraftAttachment(
        localPath: file.path,
        mediaType: 'image',
      ),
      _ => _attachment(file),
    };
  }

  @override
  Future<bool> openSettings() => camera.openSettings();

  /// Gets camera access when needed, then opens the camera. Access is asked
  /// for here, when the author chooses the camera, and never earlier.
  Future<CaptureOutcome> _capture(
    Future<XFile?> Function() open,
    String mediaType,
  ) async {
    var status = await camera.status();
    if (!status.isGranted) {
      // A prompt that has already been refused for good can't be shown again.
      if (!status.isPermanentlyDenied && !status.isRestricted) {
        status = await camera.request();
      }
      if (!status.isGranted) return CaptureFailed(_failureFor(status));
    }

    try {
      final file = await open();
      if (file == null) return const CaptureCancelled();
      return Captured(
        DraftAttachment(localPath: file.path, mediaType: mediaType),
      );
    } on PlatformException catch (error) {
      return CaptureFailed(switch (error.code) {
        'camera_access_denied' => CaptureFailure.permanentlyDenied,
        'camera_access_restricted' => CaptureFailure.restricted,
        _ => CaptureFailure.unavailable,
      });
    }
  }

  static CaptureFailure _failureFor(PermissionStatus status) {
    if (status.isRestricted) return CaptureFailure.restricted;
    if (status.isPermanentlyDenied) return CaptureFailure.permanentlyDenied;
    return CaptureFailure.denied;
  }

  static DraftAttachment? _attachment(XFile? file) {
    if (file == null) return null;
    final mime = file.mimeType;
    final extension = file.name.split('.').last.toLowerCase();
    final isVideo = mime != null
        ? mime.startsWith('video/')
        : _videoExtensions.contains(extension);
    return DraftAttachment(
      localPath: file.path,
      mediaType: isVideo ? 'video' : 'image',
    );
  }
}
