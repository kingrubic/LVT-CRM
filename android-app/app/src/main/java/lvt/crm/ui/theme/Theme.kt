package lvt.crm.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Teal = Color(0xFF0F7F78)
private val Ink = Color(0xFF1D2A33)
private val Paper = Color(0xFFF7FAFB)
private val Coral = Color(0xFFC44B3C)

private val LightColors = lightColorScheme(
    primary = Teal,
    onPrimary = Color.White,
    secondary = Ink,
    onSecondary = Color.White,
    background = Paper,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    error = Coral,
)

private val DarkColors = darkColorScheme(
    primary = Teal,
    onPrimary = Color.White,
    secondary = Color(0xFF9ED0CB),
    background = Color(0xFF121A1F),
    onBackground = Color(0xFFE8EEF1),
    surface = Color(0xFF1A242B),
    onSurface = Color(0xFFE8EEF1),
    error = Coral,
)

@Composable
fun LvtCrmTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
