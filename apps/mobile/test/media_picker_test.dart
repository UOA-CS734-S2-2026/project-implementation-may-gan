import 'package:dayli_mobile/compose/media_picker.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Records what the app asks the camera and library to do, and answers from
/// what the test queues.
class FakeImagePickerPlatform extends ImagePickerPlatform
    with MockPlatformInterfaceMixin {
  XFile? photo;
  XFile? video;
  XFile? library;
  PlatformException? failure;
  LostDataResponse lost = LostDataResponse.empty();

  final sources = <ImageSource>[];
  final requestedFullMetadata = <bool>[];
  Duration? videoMaxDuration;
  var cameraOpened = 0;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    sources.add(source);
    requestedFullMetadata.add(options.requestFullMetadata);
    if (source == ImageSource.camera) {
      cameraOpened++;
      if (failure != null) throw failure!;
      return photo;
    }
    return library;
  }

  @override
  Future<XFile?> getVideo({
    required ImageSource source,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    Duration? maxDuration,
  }) async {
    sources.add(source);
    videoMaxDuration = maxDuration;
    cameraOpened++;
    if (failure != null) throw failure!;
    return video;
  }

  @override
  Future<LostDataResponse> getLostData() async => lost;
}

class FakeCameraPermission implements CameraPermission {
  FakeCameraPermission({
    this.current = PermissionStatus.denied,
    this.afterRequest = PermissionStatus.granted,
  });

  PermissionStatus current;
  PermissionStatus afterRequest;
  var statusChecks = 0;
  var requests = 0;
  var settingsOpened = 0;

  @override
  Future<PermissionStatus> status() async {
    statusChecks++;
    return current;
  }

  @override
  Future<PermissionStatus> request() async {
    requests++;
    return current = afterRequest;
  }

  @override
  Future<bool> openSettings() async {
    settingsOpened++;
    return true;
  }
}

void main() {
  late FakeImagePickerPlatform platform;
  late FakeCameraPermission permission;
  late DeviceMediaPicker picker;

  setUp(() {
    platform = FakeImagePickerPlatform()
      ..photo = XFile('/tmp/camera/photo.jpg', name: 'photo.jpg')
      ..video = XFile('/tmp/camera/clip.mov', name: 'clip.mov')
      ..library = XFile('/tmp/library/pick.jpg', name: 'pick.jpg');
    ImagePickerPlatform.instance = platform;
    permission = FakeCameraPermission();
    picker = DeviceMediaPicker(camera: permission);
  });

  group('taking a photo', () {
    test(
      'opens the camera straight away when access is already granted',
      () async {
        permission.current = PermissionStatus.granted;

        final outcome = await picker.capturePhoto();

        expect(permission.requests, 0);
        expect(outcome, isA<Captured>());
        final attachment = (outcome as Captured).attachment;
        expect(attachment.localPath, '/tmp/camera/photo.jpg');
        expect(attachment.mediaType, 'image');
        expect(platform.sources, [ImageSource.camera]);
      },
    );

    test(
      'asks for access when the author chooses the camera, then opens it',
      () async {
        final outcome = await picker.capturePhoto();

        expect(permission.requests, 1);
        expect(outcome, isA<Captured>());
        expect(platform.cameraOpened, 1);
      },
    );

    test('does not ask for photo library access to take a photo', () async {
      permission.current = PermissionStatus.granted;
      await picker.capturePhoto();

      expect(platform.requestedFullMetadata, [false]);
    });

    test('never asks for camera access to choose from the library', () async {
      await picker.pickPhoto();

      expect(permission.statusChecks, 0);
      expect(permission.requests, 0);
      expect(platform.sources, [ImageSource.gallery]);
    });

    test('reports a declined prompt without opening the camera', () async {
      permission.afterRequest = PermissionStatus.denied;

      final outcome = await picker.capturePhoto();

      expect(permission.requests, 1);
      expect(outcome, isA<CaptureFailed>());
      expect((outcome as CaptureFailed).reason, CaptureFailure.denied);
      expect(platform.cameraOpened, 0);
    });

    test(
      'says only Settings can help after a prompt refused for good',
      () async {
        permission.afterRequest = PermissionStatus.permanentlyDenied;

        final outcome = await picker.capturePhoto();

        expect(
          (outcome as CaptureFailed).reason,
          CaptureFailure.permanentlyDenied,
        );
        expect(platform.cameraOpened, 0);
      },
    );

    test(
      'does not show the prompt again once it was refused for good',
      () async {
        permission.current = PermissionStatus.permanentlyDenied;

        final outcome = await picker.capturePhoto();

        expect(permission.requests, 0);
        expect(
          (outcome as CaptureFailed).reason,
          CaptureFailure.permanentlyDenied,
        );
        expect(platform.cameraOpened, 0);
      },
    );

    test('reports a device restriction without asking', () async {
      permission.current = PermissionStatus.restricted;

      final outcome = await picker.capturePhoto();

      expect(permission.requests, 0);
      expect((outcome as CaptureFailed).reason, CaptureFailure.restricted);
      expect(platform.cameraOpened, 0);
    });

    test('treats closing the camera as cancelling', () async {
      permission.current = PermissionStatus.granted;
      platform.photo = null;

      expect(await picker.capturePhoto(), isA<CaptureCancelled>());
    });

    test('maps the platform camera errors', () async {
      permission.current = PermissionStatus.granted;
      final expected = {
        'camera_access_denied': CaptureFailure.permanentlyDenied,
        'camera_access_restricted': CaptureFailure.restricted,
        'no_available_camera': CaptureFailure.unavailable,
        'something_else': CaptureFailure.unavailable,
      };
      for (final MapEntry(key: code, value: reason) in expected.entries) {
        platform.failure = PlatformException(code: code);
        final outcome = await picker.capturePhoto();
        expect((outcome as CaptureFailed).reason, reason, reason: code);
      }
    });
  });

  group('recording a video', () {
    test('stops just under the 15 second limit and returns a video', () async {
      permission.current = PermissionStatus.granted;

      final outcome = await picker.captureVideo();

      final attachment = (outcome as Captured).attachment;
      expect(attachment.localPath, '/tmp/camera/clip.mov');
      expect(attachment.mediaType, 'video');
      expect(platform.videoMaxDuration, isNotNull);
      expect(platform.videoMaxDuration!, lessThan(const Duration(seconds: 15)));
      expect(
        platform.videoMaxDuration!,
        greaterThan(const Duration(seconds: 14)),
      );
    });

    test('is held to the same camera access as photos', () async {
      permission.afterRequest = PermissionStatus.denied;

      final outcome = await picker.captureVideo();

      expect((outcome as CaptureFailed).reason, CaptureFailure.denied);
      expect(platform.cameraOpened, 0);
    });
  });

  group('after Android ends the app mid-capture', () {
    test('returns nothing when there is nothing to recover', () async {
      expect(await picker.recoverLostCapture(), isNull);
    });

    test('returns the photo or video that was being taken', () async {
      platform.lost = LostDataResponse(
        file: XFile('/tmp/camera/lost.jpg'),
        type: RetrieveType.image,
      );
      final photo = await picker.recoverLostCapture();
      expect(photo?.localPath, '/tmp/camera/lost.jpg');
      expect(photo?.mediaType, 'image');

      platform.lost = LostDataResponse(
        file: XFile('/tmp/camera/lost.mp4'),
        type: RetrieveType.video,
      );
      final video = await picker.recoverLostCapture();
      expect(video?.mediaType, 'video');
    });

    test('ignores a recovery that failed', () async {
      platform.lost = LostDataResponse(
        exception: PlatformException(code: 'lost'),
        type: RetrieveType.image,
      );

      expect(await picker.recoverLostCapture(), isNull);
    });
  });

  test('opens the system Settings through the permission service', () async {
    expect(await picker.openSettings(), isTrue);
    expect(permission.settingsOpened, 1);
  });
}
