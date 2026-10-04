import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Semantic colour tokens from WDCC's default theme (apps/web/themes/default.css,
/// Tailwind v4 palette converted to sRGB).
@immutable
class DayliColors extends ThemeExtension<DayliColors> {
  const DayliColors({
    required this.accent,
    required this.background,
    required this.backgroundSecondary,
    required this.backgroundTertiary,
    required this.backgroundAccent,
    required this.foreground,
    required this.foregroundSecondary,
    required this.foregroundTertiary,
    required this.foregroundAccent,
    required this.danger,
    required this.success,
    required this.card,
    required this.error,
  });

  static const light = DayliColors(
    accent: Color(0xFFA684FF), // violet-400
    background: Color(0xFFFBFAF9), // taupe-50
    backgroundSecondary: Color(0xFFF3F1F1), // taupe-100
    backgroundTertiary: Color(0xFFE8E4E3), // taupe-200
    backgroundAccent: Color(0xFFF3E8FF), // purple-100
    foreground: Color(0xFF2B2422), // taupe-800
    foregroundSecondary: Color(0xFF525252), // neutral-600
    foregroundTertiary: Color(0xFFA1A1A1), // neutral-400
    foregroundAccent: Color(0xFF6E11B0), // purple-800
    danger: Color(0xFFFF2056), // rose-500
    success: Color(0xFF00BC7D), // emerald-500
    card: Colors.white,
    error: Color(0xFFFB2C36), // red-500
  );

  final Color accent;
  final Color background;
  final Color backgroundSecondary;
  final Color backgroundTertiary;
  final Color backgroundAccent;
  final Color foreground;
  final Color foregroundSecondary;
  final Color foregroundTertiary;
  final Color foregroundAccent;
  final Color danger;
  final Color success;
  final Color card;

  /// Tailwind `text-red-500`, used by WDCC's form errors.
  final Color error;

  static DayliColors of(BuildContext context) =>
      Theme.of(context).extension<DayliColors>() ?? light;

  @override
  DayliColors copyWith() => this;

  @override
  DayliColors lerp(ThemeExtension<DayliColors>? other, double t) => this;
}

/// Whether text uses the WDCC web fonts. Tests turn them off so no font is
/// fetched from the network.
@immutable
class DayliFonts extends ThemeExtension<DayliFonts> {
  const DayliFonts({required this.useGoogleFonts});

  final bool useGoogleFonts;

  static DayliFonts of(BuildContext context) =>
      Theme.of(context).extension<DayliFonts>() ??
      const DayliFonts(useGoogleFonts: false);

  @override
  DayliFonts copyWith() => this;

  @override
  DayliFonts lerp(ThemeExtension<DayliFonts>? other, double t) => this;
}

/// Tailwind's type scale: font size and line height in logical pixels.
enum DayliTextSize {
  xs(12, 16),
  sm(14, 20),
  base(16, 24),
  lg(18, 28),
  xl(20, 28),
  xxl(24, 32),
  xxxxl(36, 40);

  const DayliTextSize(this.size, this.lineHeight);

  final double size;
  final double lineHeight;
}

/// Tailwind letter spacing, in ems.
abstract final class DayliTracking {
  static const normal = 0.0;
  static const tight = -0.025;
  static const tighter = -0.05;
}

/// WDCC's text styles: Spectral (`font-serif`) and Epilogue (`font-sans`).
abstract final class DayliText {
  static TextStyle serif(
    BuildContext context, {
    DayliTextSize size = DayliTextSize.base,
    double? fontSize,
    FontWeight weight = FontWeight.w400,
    double tracking = DayliTracking.normal,
    Color? color,
  }) => _style(
    context,
    serif: true,
    size: size,
    fontSize: fontSize,
    weight: weight,
    tracking: tracking,
    color: color,
  );

  static TextStyle sans(
    BuildContext context, {
    DayliTextSize size = DayliTextSize.base,
    double? fontSize,
    FontWeight weight = FontWeight.w400,
    double tracking = DayliTracking.normal,
    Color? color,
  }) => _style(
    context,
    serif: false,
    size: size,
    fontSize: fontSize,
    weight: weight,
    tracking: tracking,
    color: color,
  );

  static TextStyle _style(
    BuildContext context, {
    required bool serif,
    required DayliTextSize size,
    required double? fontSize,
    required FontWeight weight,
    required double tracking,
    required Color? color,
  }) {
    final pixels = fontSize ?? size.size;
    final style = TextStyle(
      fontSize: pixels,
      height: fontSize == null ? size.lineHeight / size.size : 1.1,
      fontWeight: weight,
      letterSpacing: tracking * pixels,
      color: color ?? DayliColors.of(context).foreground,
    );
    if (!DayliFonts.of(context).useGoogleFonts) return style;
    return serif
        ? GoogleFonts.spectral(textStyle: style)
        : GoogleFonts.epilogue(textStyle: style);
  }
}

/// WDCC's `shadow-card` and `shadow-nav` utilities.
abstract final class DayliShadows {
  static const card = [
    BoxShadow(color: Color(0x03000000), offset: Offset(2, 2), blurRadius: 8),
    BoxShadow(color: Color(0x05000000), offset: Offset(8, 8), blurRadius: 16),
    BoxShadow(color: Color(0x08000000), offset: Offset(16, 16), blurRadius: 32),
  ];

  /// Tailwind `shadow-md`.
  static const md = [
    BoxShadow(
      color: Color(0x1A000000),
      offset: Offset(0, 4),
      blurRadius: 6,
      spreadRadius: -1,
    ),
    BoxShadow(
      color: Color(0x1A000000),
      offset: Offset(0, 2),
      blurRadius: 4,
      spreadRadius: -2,
    ),
  ];

  static const nav = [
    BoxShadow(
      color: Color(0x0A000000),
      blurRadius: 16,
      offset: Offset(0, -4),
    ),
  ];
}

/// Builds the app theme. Tests pass [useGoogleFonts] false so no font is
/// fetched from the network.
ThemeData buildDayliTheme({bool useGoogleFonts = true}) {
  const colors = DayliColors.light;
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: colors.accent,
      primary: colors.foregroundAccent,
      surface: colors.background,
      error: colors.danger,
    ),
    scaffoldBackgroundColor: colors.background,
    extensions: [
      colors,
      DayliFonts(useGoogleFonts: useGoogleFonts),
    ],
  );
  final body = useGoogleFonts
      ? GoogleFonts.epilogueTextTheme(base.textTheme)
      : base.textTheme;
  return base.copyWith(
    textTheme: body.apply(
      bodyColor: colors.foreground,
      displayColor: colors.foreground,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: colors.foreground,
      selectionColor: colors.backgroundAccent,
    ),
  );
}
