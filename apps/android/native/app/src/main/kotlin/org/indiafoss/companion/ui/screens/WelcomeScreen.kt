package org.indiafoss.companion.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.ui.theme.EventIdentity
import org.indiafoss.companion.ui.theme.brand
import org.indiafoss.companion.ui.theme.eyebrow

/**
 * First-run setup (#107): reminders, who you are, then ranking. Every
 * step can be skipped; everything here can be changed later under Settings,
 * Your card or Rank. Shown once, and again from Settings on request.
 *
 * A launch surface: it carries the event identity, so it is rendered in the
 * brand scheme whatever the wallpaper palette (#33).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun WelcomeScreen(
    state: UiState,
    onReminders: (Boolean) -> Unit,
    onSave: (ContactCard) -> Unit,
    onDone: (rank: Boolean) -> Unit,
) {
    val steps = listOf("Reminders", "You", "Your day")
    var step by remember { mutableIntStateOf(0) }
    var draft by remember(state.profile) { mutableStateOf(state.profile) }
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onReminders(granted)
        if (granted) step = 1
    }
    val eventName = state.bundle?.name ?: "IndiaFOSS"

    EventIdentity { Scaffold(topBar = { TopAppBar(title = { Text("Welcome") }) }) { padding ->
        val brand = MaterialTheme.brand
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            // The hero: ink surface, one mint rule, pale-green eyebrow — the PWA's home hero, at phone size.
            Card(
                Modifier.fillMaxWidth().padding(16.dp, 8.dp),
                colors = CardDefaults.cardColors(containerColor = brand.inkSurface, contentColor = brand.onInk),
            ) {
                Box(Modifier.fillMaxWidth().height(4.dp).background(brand.mint))
                Column(Modifier.padding(20.dp)) {
                    Text("SET UP IN A MINUTE", style = MaterialTheme.typography.eyebrow, color = brand.mintOnInk)
                    Text("Welcome to $eventName", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp))
                    Text(
                        "Three quick steps, all optional, so the app can remind you, put your name on a card and plan your day. Everything stays on this phone.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
            LinearProgressIndicator(
                progress = { (step + 1).toFloat() / steps.size },
                modifier = Modifier.fillMaxWidth().padding(20.dp, 4.dp),
            )
            Text(
                "${step + 1} · ${steps[step].uppercase()}",
                style = MaterialTheme.typography.eyebrow,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp, 8.dp, 20.dp, 0.dp),
            )
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    when (step) {
                        0 -> {
                            Text("Never miss a talk you picked", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "A local \"starting soon\" and \"leave now\" alarm for the sessions you bookmark, timed with the walk from wherever you last scanned. No push service, nothing leaves the phone.",
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (state.remindersEnabled) {
                                Text("Reminders are on.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                                Button(onClick = { step = 1 }) { Text("Next") }
                            } else FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                    else { onReminders(true); step = 1 }
                                }) { Text("Turn on reminders") }
                                OutlinedButton(onClick = { step = 1 }) { Text("Not now") }
                            }
                        }
                        1 -> {
                            Text("Who is on your card", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Your name and a few public profiles make the contact card people scan when you meet. Add more, or take any of it off, under Your card later.",
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            OutlinedTextField(draft.fullName, { draft = draft.copy(fullName = it) }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(draft.organization, { draft = draft.copy(organization = it) }, label = { Text("Organisation") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(draft.socials["github"].orEmpty(), { draft = draft.copy(socials = draft.socials + ("github" to it)) }, label = { Text("GitHub") }, placeholder = { Text("https://github.com/you") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(draft.socials["linkedin"].orEmpty(), { draft = draft.copy(socials = draft.socials + ("linkedin" to it)) }, label = { Text("LinkedIn") }, placeholder = { Text("https://linkedin.com/in/you") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(draft.socials["mastodon"].orEmpty(), { draft = draft.copy(socials = draft.socials + ("mastodon" to it)) }, label = { Text("Mastodon") }, placeholder = { Text("https://fosstodon.org/@you") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(draft.fossUnitedUsername, { draft = draft.copy(fossUnitedUsername = it) }, label = { Text("FOSS United username") }, placeholder = { Text("your_username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            // Buttons wrap rather than squeeze at large font sizes.
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { onSave(draft.copy(fullName = draft.fullName.trim())); step = 2 }) {
                                    Text(if (draft.fullName.isBlank()) "Skip for now" else "Save")
                                }
                                TextButton(onClick = { step = 0 }) { Text("Back") }
                            }
                        }
                        else -> {
                            Text("Rank the sessions", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Say which devrooms are for you, swipe through the talks, settle the overlaps: a few minutes now and the app builds a plan around what you would actually go to.",
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            // Buttons wrap rather than squeeze at large font sizes.
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { onDone(true) }) { Text("Rank my sessions") }
                                OutlinedButton(onClick = { onDone(false) }) { Text("Later") }
                            }
                            TextButton(onClick = { step = 1 }) { Text("Back") }
                        }
                    }
                }
            }
            TextButton(onClick = { onDone(false) }, modifier = Modifier.padding(16.dp, 0.dp)) { Text("Skip setup · run it again from Settings") }
            Spacer(Modifier.height(24.dp))
        }
    } }
}
