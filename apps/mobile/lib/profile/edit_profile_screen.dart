import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/api_failure.dart';
import '../api/profile_client.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';

const bioMaxLength = 160;
const aboutMaxLength = 100;
const mbtiTypes = [
  'INTJ',
  'INTP',
  'INFJ',
  'INFP',
  'ISTJ',
  'ISFJ',
  'ISTP',
  'ISFP',
  'ENTJ',
  'ENTP',
  'ENFJ',
  'ENFP',
  'ESTJ',
  'ESFJ',
  'ESTP',
  'ESFP',
];
const publicNameMaxLength = 80;
final _handlePattern = RegExp(r'^[a-z0-9][a-z0-9_]{2,29}$');

/// Your public name, bio, username, and privacy.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _name = TextEditingController();
  final _bio = TextEditingController();
  final _username = TextEditingController();
  final _whatIDo = TextEditingController();
  final _listeningTo = TextEditingController();
  String _mbti = '';
  ProfileDetails? _profile;
  ApiFailure? _loadFailure;
  bool _loading = true;
  bool _saving = false;
  bool _renaming = false;
  bool _savingPrivacy = false;
  String? _profileNotice;
  String? _usernameNotice;
  String? _privacyNotice;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _profile == null && _loadFailure == null) _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _username.dispose();
    _whatIDo.dispose();
    _listeningTo.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final services = AppScope.of(context);
    final username = services.session.user?.username;
    if (username == null) {
      setState(() {
        _loading = false;
        _loadFailure = const NotFound();
      });
      return;
    }
    final result = await services.profiles.details(username);
    if (!mounted) return;
    setState(() {
      _loading = false;
      switch (result) {
        case ApiSuccess(:final value):
          _show(value);
        case ApiError(:final failure):
          _loadFailure = failure;
      }
    });
  }

  void _show(ProfileDetails profile) {
    _profile = profile;
    _loadFailure = null;
    _name.text = profile.displayName == profile.username
        ? ''
        : profile.displayName ?? '';
    _bio.text = profile.bio ?? '';
    _mbti = profile.mbti ?? '';
    _whatIDo.text = profile.whatIDo ?? '';
    _listeningTo.text = profile.listeningTo ?? '';
    _username.text = profile.username;
  }

  static String _failureText(ApiFailure failure) => switch (failure) {
    Conflict(:final message) => message,
    InvalidRequest(:final message) => message,
    NetworkUnavailable() => "You're offline. Try again.",
    _ => "That couldn't be saved. Try again.",
  };

  Future<void> _saveProfile() async {
    setState(() {
      _saving = true;
      _profileNotice = null;
    });
    final result = await AppScope.of(context).profiles.update(
      publicName: _name.text.trim(),
      bio: _bio.text.trim(),
      mbti: _mbti,
      whatIDo: _whatIDo.text.trim(),
      listeningTo: _listeningTo.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _saving = false;
      switch (result) {
        case ApiSuccess(:final value):
          _show(value);
          _profileNotice = 'Saved.';
        case ApiError(:final failure):
          _profileNotice = _failureText(failure);
      }
    });
  }

  Future<void> _changeUsername() async {
    final next = _username.text.trim().toLowerCase();
    setState(() {
      _renaming = true;
      _usernameNotice = null;
    });
    final services = AppScope.of(context);
    final result = await services.profiles.changeUsername(next);
    if (!mounted) return;
    if (result case ApiSuccess(:final value)) {
      await services.session.usernameChanged(value);
      final refreshed = await services.profiles.details(value);
      if (!mounted) return;
      setState(() {
        _renaming = false;
        if (refreshed case ApiSuccess(value: final profile)) _show(profile);
        _usernameNotice = 'Username changed.';
      });
      return;
    }
    setState(() {
      _renaming = false;
      _usernameNotice = _failureText((result as ApiError<String>).failure);
    });
  }

  Future<void> _setPrivate(bool isPrivate) async {
    setState(() {
      _savingPrivacy = true;
      _privacyNotice = null;
    });
    final result = await AppScope.of(
      context,
    ).profiles.update(isPrivate: isPrivate);
    if (!mounted) return;
    setState(() {
      _savingPrivacy = false;
      switch (result) {
        case ApiSuccess(:final value):
          _profile = value;
        case ApiError(:final failure):
          _privacyNotice = _failureText(failure);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final muted = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundSecondary,
    );
    final profile = _profile;

    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 32),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Back',
                  onPressed: () =>
                      context.canPop() ? context.pop() : context.go('/me'),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                Expanded(
                  child: Text(
                    'edit profile',
                    textAlign: TextAlign.center,
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.xxl,
                      weight: FontWeight.w600,
                      tracking: DayliTracking.tight,
                    ),
                  ),
                ),
                const SizedBox(width: 48),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _loading
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : profile == null
                  ? Column(
                      children: [
                        Text(
                          "Your profile couldn't be loaded.",
                          key: const Key('editProfile.error'),
                          style: muted,
                        ),
                        const SizedBox(height: 16),
                        DayliButton(
                          label: 'Try again',
                          color: ButtonColor.foreground,
                          height: 44,
                          onPressed: () {
                            setState(() => _loading = true);
                            _load();
                          },
                        ),
                      ],
                    )
                  : _form(context, profile, muted),
            ),
          ],
        ),
      ),
    );
  }

  Widget _form(BuildContext context, ProfileDetails profile, TextStyle muted) {
    final waitUntil = profile.usernameChangeAvailableAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DayliFormInput(
          label: 'Public name',
          fieldKey: const Key('editProfile.name'),
          controller: _name,
          placeholder: profile.username,
          helper: 'Leave blank to show your username.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        DayliFormInput(
          label: 'Bio',
          fieldKey: const Key('editProfile.bio'),
          controller: _bio,
          minLines: 2,
          maxLines: 4,
          helper: '${_bio.text.length}/$bioMaxLength',
          error: _bio.text.length > bioMaxLength
              ? 'Keep it to $bioMaxLength characters.'
              : null,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        Text(
          'MBTI',
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            weight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          key: const Key('editProfile.mbti'),
          initialValue: _mbti,
          items: [
            const DropdownMenuItem(value: '', child: Text('—')),
            for (final type in mbtiTypes)
              DropdownMenuItem(value: type, child: Text(type)),
          ],
          onChanged: (value) => setState(() => _mbti = value ?? ''),
        ),
        const SizedBox(height: 16),
        DayliFormInput(
          label: 'What I do',
          fieldKey: const Key('editProfile.whatIDo'),
          controller: _whatIDo,
          error: _whatIDo.text.length > aboutMaxLength
              ? 'Keep it to $aboutMaxLength characters.'
              : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        DayliFormInput(
          label: "What I'm listening to",
          fieldKey: const Key('editProfile.listeningTo'),
          controller: _listeningTo,
          error: _listeningTo.text.length > aboutMaxLength
              ? 'Keep it to $aboutMaxLength characters.'
              : null,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        if (_profileNotice != null) ...[
          Text(
            _profileNotice!,
            key: const Key('editProfile.notice'),
            style: muted,
          ),
          const SizedBox(height: 8),
        ],
        DayliButton(
          key: const Key('editProfile.save'),
          label: _saving ? 'Saving...' : 'Save profile',
          fullWidth: true,
          height: 48,
          onPressed:
              _saving ||
                  _bio.text.length > bioMaxLength ||
                  _whatIDo.text.length > aboutMaxLength ||
                  _listeningTo.text.length > aboutMaxLength ||
                  _name.text.length > publicNameMaxLength
              ? null
              : _saveProfile,
        ),
        const SizedBox(height: 32),
        DayliFormInput(
          label: 'Username',
          fieldKey: const Key('editProfile.username'),
          controller: _username,
          readOnly: waitUntil != null,
          helper: waitUntil != null
              ? 'You can change your username again on ${MaterialLocalizations.of(context).formatFullDate(waitUntil.toLocal())}.'
              : 'You can change it once every 30 days. Your old username stays reserved for you for 30 days, and links to it lead here.',
          error: _handlePattern.hasMatch(_username.text.trim().toLowerCase())
              ? null
              : 'Use 3-30 lowercase letters, numbers, or underscores.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        if (_usernameNotice != null) ...[
          Text(
            _usernameNotice!,
            key: const Key('editProfile.usernameNotice'),
            style: muted,
          ),
          const SizedBox(height: 8),
        ],
        DayliButton(
          key: const Key('editProfile.changeUsername'),
          label: _renaming ? 'Changing...' : 'Change username',
          color: ButtonColor.foreground,
          fullWidth: true,
          height: 48,
          onPressed:
              _renaming ||
                  waitUntil != null ||
                  _username.text.trim().toLowerCase() == profile.username ||
                  !_handlePattern.hasMatch(_username.text.trim().toLowerCase())
              ? null
              : _changeUsername,
        ),
        const SizedBox(height: 32),
        SwitchListTile(
          key: const Key('editProfile.private'),
          contentPadding: EdgeInsets.zero,
          value: profile.isPrivate,
          onChanged: _savingPrivacy ? null : _setPrivate,
          title: Text(
            'Private profile',
            style: DayliText.sans(context, weight: FontWeight.w500),
          ),
          subtitle: Text(
            profile.isPrivate
                ? 'Only friends can see your bio, streak, and released Friends posts.'
                : 'Anyone, including signed-out visitors, can see your bio, streak, and released Friends posts. Solo and unreleased posts stay private.',
            style: muted,
          ),
        ),
        if (_privacyNotice != null)
          Text(
            _privacyNotice!,
            key: const Key('editProfile.privacyNotice'),
            style: muted,
          ),
      ],
    );
  }
}
