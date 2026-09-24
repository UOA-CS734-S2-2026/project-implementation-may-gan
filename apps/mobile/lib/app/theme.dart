import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Semantic colour tokens shared with the web app's default theme
/// (apps/web/themes/default.css, Tailwind v4 palette converted to sRGB).
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

  static DayliColors of(BuildContext context) =>
      Theme.of(context).extension<DayliColors>() ?? light;

  @override
  DayliColors copyWith() => this;

  @override
  DayliColors lerp(ThemeExtension<DayliColors>? other, double t) => this;
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
    extensions: const [colors],
  );

  // Web headings use Spectral (serif) and body text uses Epilogue.
  final body = useGoogleFonts
      ? GoogleFonts.epilogueTextTheme(base.textTheme)
      : base.textTheme;
  TextStyle? serif(TextStyle? style) =>
      useGoogleFonts ? GoogleFonts.spectral(textStyle: style) : style;

  final textTheme = body
      .copyWith(
        displaySmall: serif(
          body.displaySmall,
        )?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -1.2),
        headlineMedium: serif(
          body.headlineMedium,
        )?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -1),
        titleLarge: serif(
          body.titleLarge,
        )?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.5),
      )
      .apply(bodyColor: colors.foreground, displayColor: colors.foreground);

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: colors.background,
      foregroundColor: colors.foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: colors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: colors.backgroundSecondary,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: colors.accent, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: colors.backgroundAccent,
        foregroundColor: colors.foregroundAccent,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: colors.background,
      indicatorColor: colors.backgroundAccent,
    ),
  );
}
