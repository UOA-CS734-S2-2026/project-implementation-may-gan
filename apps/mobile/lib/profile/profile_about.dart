import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Tailwind's rose, sky, and emerald tints, as the original web app used.
const _rose = (
  bg: Color(0xFFFFF1F2),
  label: Color(0xFFFB7185),
  value: Color(0xFFF43F5E),
);
const _sky = (
  bg: Color(0xFFF0F9FF),
  label: Color(0xFF38BDF8),
  value: Color(0xFF0284C7),
);
const _emerald = (
  bg: Color(0xFFECFDF5),
  label: Color(0xFF10B981),
  value: Color(0xFF047857),
);

/// MBTI, what they do, and what they're listening to.
class ProfileAboutCards extends StatelessWidget {
  const ProfileAboutCards({
    super.key,
    required this.mbti,
    required this.whatIDo,
    required this.listeningTo,
  });

  final String? mbti;
  final String? whatIDo;
  final String? listeningTo;

  @override
  Widget build(BuildContext context) {
    Widget card(
      String key,
      ({Color bg, Color label, Color value}) tint,
      String label,
      String? value, {
      Widget? leading,
    }) => Container(
      key: Key('profile.about.$key'),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: tint.bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tint.label.withValues(alpha: 0.2)),
        boxShadow: DayliShadows.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: DayliText.sans(
              context,
              size: DayliTextSize.xs,
              weight: FontWeight.w500,
              color: tint.label,
            ),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              if (leading != null) ...[leading, const SizedBox(width: 6)],
              Flexible(
                child: Text(
                  value == null || value.isEmpty ? '—' : value,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2,
                  style: DayliText.sans(
                    context,
                    weight: FontWeight.w600,
                    color: tint.value,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: card('mbti', _rose, 'mbti', mbti)),
                const SizedBox(width: 10),
                Expanded(child: card('whatIDo', _sky, 'what i do', whatIDo)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          card(
            'listeningTo',
            _emerald,
            "what i'm listening to",
            listeningTo,
            leading: Icon(
              Icons.music_note_rounded,
              size: 18,
              color: _emerald.value,
            ),
          ),
        ],
      ),
    );
  }
}
