# Tokens do Passarim

> Arquivo gerado por `tools/build-tokens.mjs` a partir de `passarim-tokens.json`. Não edite à mão.

Esquema Material 3. Os nomes dos papéis são os mesmos de `ColorScheme` no Compose.

## Cores

| Papel | Claro | Escuro |
|---|---|---|
| `primary` | `#1A6D3C` | `#7DDB97` |
| `onPrimary` | `#FFFFFF` | `#00391B` |
| `primaryContainer` | `#A6F4B6` | `#00522A` |
| `onPrimaryContainer` | `#00210E` | `#A6F4B6` |
| `secondary` | `#4E6352` | `#B4CCB7` |
| `onSecondary` | `#FFFFFF` | `#203524` |
| `secondaryContainer` | `#D0E8D2` | `#364B3A` |
| `onSecondaryContainer` | `#0B1F10` | `#D0E8D2` |
| `tertiary` | `#7A5900` | `#F0BF4C` |
| `onTertiary` | `#FFFFFF` | `#412D00` |
| `tertiaryContainer` | `#FFDEA3` | `#5E4200` |
| `onTertiaryContainer` | `#261900` | `#FFDEA3` |
| `error` | `#BA1A1A` | `#FFB4AB` |
| `onError` | `#FFFFFF` | `#690005` |
| `errorContainer` | `#FFDAD6` | `#93000A` |
| `onErrorContainer` | `#410002` | `#FFDAD6` |
| `background` | `#F6FBF3` | `#101410` |
| `onBackground` | `#181D18` | `#E0E4DC` |
| `surface` | `#F6FBF3` | `#101410` |
| `onSurface` | `#181D18` | `#E0E4DC` |
| `surfaceVariant` | `#DCE5DB` | `#414942` |
| `onSurfaceVariant` | `#414942` | `#C0C9BF` |
| `surfaceDim` | `#D7DBD4` | `#101410` |
| `surfaceBright` | `#F6FBF3` | `#363A35` |
| `surfaceContainerLowest` | `#FFFFFF` | `#0B0F0B` |
| `surfaceContainerLow` | `#F0F5ED` | `#181D18` |
| `surfaceContainer` | `#EAF0E8` | `#1C211C` |
| `surfaceContainerHigh` | `#E4EAE2` | `#272B26` |
| `surfaceContainerHighest` | `#DFE4DC` | `#323630` |
| `outline` | `#717971` | `#97A097` |
| `outlineVariant` | `#C0C9BF` | `#414942` |
| `inverseSurface` | `#2D322D` | `#E0E4DC` |
| `inverseOnSurface` | `#EEF2EB` | `#2D322D` |
| `inversePrimary` | `#8BD89D` | `#1A6D3C` |
| `scrim` | `#000000` | `#000000` |

### Compose (`Color.kt`)

```kotlin
val PassarimLightColors = lightColorScheme(
    primary = Color(0xFF1A6D3C),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFA6F4B6),
    onPrimaryContainer = Color(0xFF00210E),
    secondary = Color(0xFF4E6352),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD0E8D2),
    onSecondaryContainer = Color(0xFF0B1F10),
    tertiary = Color(0xFF7A5900),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFFDEA3),
    onTertiaryContainer = Color(0xFF261900),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    background = Color(0xFFF6FBF3),
    onBackground = Color(0xFF181D18),
    surface = Color(0xFFF6FBF3),
    onSurface = Color(0xFF181D18),
    surfaceVariant = Color(0xFFDCE5DB),
    onSurfaceVariant = Color(0xFF414942),
    surfaceDim = Color(0xFFD7DBD4),
    surfaceBright = Color(0xFFF6FBF3),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF0F5ED),
    surfaceContainer = Color(0xFFEAF0E8),
    surfaceContainerHigh = Color(0xFFE4EAE2),
    surfaceContainerHighest = Color(0xFFDFE4DC),
    outline = Color(0xFF717971),
    outlineVariant = Color(0xFFC0C9BF),
    inverseSurface = Color(0xFF2D322D),
    inverseOnSurface = Color(0xFFEEF2EB),
    inversePrimary = Color(0xFF8BD89D),
    scrim = Color(0xFF000000),
)

val PassarimDarkColors = darkColorScheme(
    primary = Color(0xFF7DDB97),
    onPrimary = Color(0xFF00391B),
    primaryContainer = Color(0xFF00522A),
    onPrimaryContainer = Color(0xFFA6F4B6),
    secondary = Color(0xFFB4CCB7),
    onSecondary = Color(0xFF203524),
    secondaryContainer = Color(0xFF364B3A),
    onSecondaryContainer = Color(0xFFD0E8D2),
    tertiary = Color(0xFFF0BF4C),
    onTertiary = Color(0xFF412D00),
    tertiaryContainer = Color(0xFF5E4200),
    onTertiaryContainer = Color(0xFFFFDEA3),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = Color(0xFF101410),
    onBackground = Color(0xFFE0E4DC),
    surface = Color(0xFF101410),
    onSurface = Color(0xFFE0E4DC),
    surfaceVariant = Color(0xFF414942),
    onSurfaceVariant = Color(0xFFC0C9BF),
    surfaceDim = Color(0xFF101410),
    surfaceBright = Color(0xFF363A35),
    surfaceContainerLowest = Color(0xFF0B0F0B),
    surfaceContainerLow = Color(0xFF181D18),
    surfaceContainer = Color(0xFF1C211C),
    surfaceContainerHigh = Color(0xFF272B26),
    surfaceContainerHighest = Color(0xFF323630),
    outline = Color(0xFF97A097),
    outlineVariant = Color(0xFF414942),
    inverseSurface = Color(0xFFE0E4DC),
    inverseOnSurface = Color(0xFF2D322D),
    inversePrimary = Color(0xFF1A6D3C),
    scrim = Color(0xFF000000),
)
```

## Conservação

Fundo / texto do selo, por tema. Contraste mínimo 4.5:1 verificado por `tools/check-tokens.mjs`.

| Status | Rótulo | Claro | Escuro |
|---|---|---|---|
| `LC` | Pouco preocupante | `#CDEBD3` / `#0B3B1C` | `#1F4A2C` / `#BDF0C8` |
| `NT` | Quase ameaçada | `#E3EDB8` / `#33400A` | `#4A5418` / `#E3EDB8` |
| `VU` | Vulnerável | `#FFE08A` / `#4A3600` | `#5E4800` / `#FFE08A` |
| `EN` | Em perigo | `#FFC9A3` / `#5A2200` | `#6E3000` / `#FFC9A3` |
| `CR` | Criticamente em perigo | `#FFB4AB` / `#5C0008` | `#8A1018` / `#FFDAD6` |
| `EW` | Extinta na natureza | `#E1D5F0` / `#2E1A4D` | `#44306A` / `#E8DDFF` |

## Tipografia

Família única **Manrope** (variável, embarcada no app). Itálico (nome científico) é sintetizado, pois a família não tem itálico. Tamanhos em sp, altura de linha em sp, tracking em sp.

| Estilo | Tamanho | Linha | Peso | Tracking |
|---|---|---|---|---|
| `displayLarge` | 57 | 64 | 700 | -0.25 |
| `displayMedium` | 45 | 52 | 700 | 0 |
| `displaySmall` | 36 | 44 | 700 | 0 |
| `headlineLarge` | 32 | 40 | 700 | 0 |
| `headlineMedium` | 28 | 36 | 700 | 0 |
| `headlineSmall` | 24 | 32 | 700 | 0 |
| `titleLarge` | 22 | 28 | 700 | 0 |
| `titleMedium` | 16 | 24 | 600 | 0.15 |
| `titleSmall` | 14 | 20 | 600 | 0.1 |
| `bodyLarge` | 16 | 24 | 400 | 0.5 |
| `bodyMedium` | 14 | 20 | 400 | 0.25 |
| `bodySmall` | 12 | 16 | 400 | 0.4 |
| `labelLarge` | 14 | 20 | 600 | 0.1 |
| `labelMedium` | 12 | 16 | 600 | 0.5 |
| `labelSmall` | 11 | 16 | 600 | 0.5 |

## Forma e espaço

| Token | Valor (dp) | Uso |
|---|---|---|
| `shape.card` | 12 | cards, player, mapa |
| `shape.field` | 16 | campos |
| `shape.pill` | 28 | chips, botões, busca |
| `space.unit` | 4 | grade base |
| `space.screenMargin` | 16 | margem lateral de tela |
| `space.touchTarget` | 48 | alvo de toque mínimo (chips têm 36dp visuais, área de toque de 48dp) |
