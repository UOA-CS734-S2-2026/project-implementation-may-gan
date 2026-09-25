import 'package:image_picker/image_picker.dart';

import '../drafts/daily_post_draft.dart';

/// Chooses photos and videos for a dayli. Media stays on the device until the
/// media upload API lands; only the draft keeps a reference to it.
abstract interface class MediaPicker {
  /// The first slot takes a photo or a video.
  Future<DraftAttachment?> pickPhotoOrVideo();

  /// Later slots take photos only.
  Future<DraftAttachment?> pickPhoto();
}

class DeviceMediaPicker implements MediaPicker {
  const DeviceMediaPicker();

  static const _videoExtensions = {'mp4', 'mov', 'webm', 'm4v', '3gp', 'mkv'};

  @override
  Future<DraftAttachment?> pickPhotoOrVideo() async =>
      _attachment(await ImagePicker().pickMedia());

  @override
  Future<DraftAttachment?> pickPhoto() async =>
      _attachment(await ImagePicker().pickImage(source: ImageSource.gallery));

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
