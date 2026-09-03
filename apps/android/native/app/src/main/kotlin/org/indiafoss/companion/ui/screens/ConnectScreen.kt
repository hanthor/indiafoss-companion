package org.indiafoss.companion.ui.screens

import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.VCard
import org.indiafoss.companion.data.MetContact

/** Payloads above this scan poorly on a phone screen. */
private const val MAX_QR_BYTES = 1500

private data class Field(val key: String, val label: String, val get: (ContactCard) -> String, val set: (ContactCard, String) -> ContactCard, val private: Boolean = false)

private val IDENTITY = listOf(
    Field("name", "Name", { it.fullName }, { c, v -> c.copy(fullName = v) }),
    Field("organization", "Organisation", { it.organization }, { c, v -> c.copy(organization = v) }),
    Field("website", "Website", { it.website }, { c, v -> c.copy(website = v) }),
)
private val LINKS = listOf(
    Field("fossunited", "FOSS United username", { it.fossUnitedUsername }, { c, v -> c.copy(fossUnitedUsername = v) }),
    Field("github", "GitHub", { it.socials["github"].orEmpty() }, { c, v -> c.copy(socials = c.socials + ("github" to v)) }),
    Field("linkedin", "LinkedIn", { it.socials["linkedin"].orEmpty() }, { c, v -> c.copy(socials = c.socials + ("linkedin" to v)) }),
    Field("mastodon", "Mastodon", { it.socials["mastodon"].orEmpty() }, { c, v -> c.copy(socials = c.socials + ("mastodon" to v)) }),
    Field("matrixId", "Matrix ID", { it.matrixId }, { c, v -> c.copy(matrixId = v) }),
)
private val PRIVATE = listOf(
    Field("email", "Email", { it.email }, { c, v -> c.copy(email = v) }, private = true),
    Field("phone", "Phone", { it.phone }, { c, v -> c.copy(phone = v) }, private = true),
)

/**
 * The attendee's card as one live QR (a plain vCard 3.0 any camera saves to
 * Contacts, with the companion's X- extras), the fields with their share
 * switches, and the people met. Everything stays on the phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectScreen(
    profile: ContactCard,
    contacts: List<MetContact>,
    signedCard: String = "",
    fingerprint: String? = null,
    onSave: (ContactCard) -> Unit,
    onScan: () -> Unit,
    onRemoveContact: (String) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val vcard = remember(profile, signedCard) { signedCard.ifBlank { VCard.encode(profile) } }
    val bytes = vcard.toByteArray(Charsets.UTF_8).size
    val qr = remember(vcard) { if (profile.fullName.isBlank() || bytes > MAX_QR_BYTES) null else qrBitmap(vcard) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your card") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = {
                    IconButton(onClick = onScan) { Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan a code") }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (qr != null) {
                            Image(qr.asImageBitmap(), contentDescription = "Your contact details as a QR code", modifier = Modifier.size(232.dp))
                        } else {
                            Text(
                                if (profile.fullName.isBlank()) "Add your name below and this becomes a code someone can scan."
                                else "Too much for one QR. Switch off a field or two.",
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(24.dp),
                            )
                        }
                        Text(profile.fullName.ifBlank { "Your name" }, style = MaterialTheme.typography.titleLarge)
                        Text(profile.organization.ifBlank { "Add an organisation below" }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            "vCard 3.0 · $bytes bytes" + if (fingerprint != null && signedCard.isNotBlank()) " · signed" else "",
                            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp),
                        )
                        if (fingerprint != null) {
                            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                KeyBadge(fingerprint, size = 40.dp)
                                Column(Modifier.padding(start = 10.dp)) {
                                    Text("KEY BADGE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(org.indiafoss.companion.core.Handshake.shortFingerprint(fingerprint), style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/vcard"
                                    putExtra(Intent.EXTRA_TEXT, vcard)
                                    putExtra(Intent.EXTRA_SUBJECT, profile.fullName.ifBlank { "Contact" })
                                }
                                context.startActivity(Intent.createChooser(send, "Share card"))
                            }, enabled = qr != null) { Text("Share card") }
                            OutlinedButton(onClick = onScan) { Text("Scan a code") }
                        }
                    }
                }
                Text(
                    "Any phone camera saves you straight to Contacts. A QR can be photographed — email and phone stay off unless you switch them on.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp, 4.dp),
                )
            }
            item { SectionHeader("Identity") }
            items(IDENTITY, key = { it.key }) { FieldRow(it, profile, onSave) }
            item { SectionHeader("Profiles & links") }
            items(LINKS, key = { it.key }) { FieldRow(it, profile, onSave) }
            item { SectionHeader("Private · off by default") }
            items(PRIVATE, key = { it.key }) { FieldRow(it, profile, onSave) }
            item { SectionHeader("People I met · ${contacts.size}") }
            if (contacts.isEmpty()) item {
                Text("No one yet. Scan a friend's card and it lands here.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp, 4.dp))
            }
            items(contacts, key = { it.id }) { met ->
                ListItem(
                    leadingContent = { met.fingerprint?.let { KeyBadge(it, size = 40.dp) } },
                    headlineContent = { Text(met.card.fullName.ifBlank { "Unnamed contact" }) },
                    supportingContent = {
                        val line = listOf(met.card.organization, met.card.socials["github"].orEmpty(), met.card.email).filter { it.isNotBlank() }.joinToString(" · ")
                        Column {
                            if (line.isNotBlank()) Text(line, maxLines = 2)
                            Text(
                                when (met.signature) {
                                    "valid" -> "Signed by their phone · ${met.fingerprint?.let(org.indiafoss.companion.core.Handshake::shortFingerprint)}"
                                    "invalid" -> "Signature does not match"
                                    "unchecked" -> "Signed, not checked on this phone"
                                    else -> "Unsigned card"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (met.signature == "invalid") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    trailingContent = {
                        Row {
                            TextButton(onClick = {
                                val send = Intent(Intent.ACTION_SEND).apply { type = "text/vcard"; putExtra(Intent.EXTRA_TEXT, met.vcard) }
                                context.startActivity(Intent.createChooser(send, "Save contact"))
                            }) { Text("Save") }
                            TextButton(onClick = { onRemoveContact(met.id) }) { Text("Remove") }
                        }
                    },
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun FieldRow(field: Field, profile: ContactCard, onSave: (ContactCard) -> Unit) {
    var text by remember(profile, field.key) { mutableStateOf(field.get(profile)) }
    Row(Modifier.fillMaxWidth().padding(16.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it; onSave(field.set(profile, it)) },
            label = { Text(field.label) },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = profile.shares(field.key) && text.isNotBlank(),
            enabled = text.isNotBlank(),
            onCheckedChange = { on -> onSave(profile.copy(share = profile.share + (field.key to on))) },
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** The card as a QR, error-correction M, rendered once per change of text. */
fun qrBitmap(text: String, size: Int = 640): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(
        text, BarcodeFormat.QR_CODE, size, size,
        mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 1, EncodeHintType.CHARACTER_SET to "UTF-8"),
    )
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    val pixels = IntArray(size * size)
    for (y in 0 until size) for (x in 0 until size) {
        pixels[y * size + x] = if (matrix.get(x, y)) 0xFF141414.toInt() else 0xFFFFFFFF.toInt()
    }
    bitmap.setPixels(pixels, 0, size, 0, 0, size, size)
    bitmap
}.getOrNull()

/** The PWA's 5×5 mirrored pixel identicon from a key fingerprint: the same key, the same badge on both apps. */
@Composable
fun KeyBadge(fingerprint: String, size: androidx.compose.ui.unit.Dp) {
    val bytes = fingerprint.chunked(2).mapNotNull { it.toIntOrNull(16) }
    val palette = listOf(0xFF08B74F, 0xFFECAC4B, 0xFFDF5447, 0xFF04C7BD, 0xFF5F84FF, 0xFFCF2797)
    val fg = androidx.compose.ui.graphics.Color(palette[(bytes.getOrNull(0) ?: 0) % palette.size])
    val bg = androidx.compose.ui.graphics.Color(0xFF18222A)
    androidx.compose.foundation.Canvas(Modifier.size(size)) {
        val cell = this.size.width / 5f
        drawRect(bg)
        for (y in 0 until 5) for (x in 0 until 3) {
            val bit = ((bytes.getOrNull(1 + y) ?: 0) shr x) and 1
            if (bit == 0) continue
            drawRect(fg, topLeft = androidx.compose.ui.geometry.Offset(x * cell, y * cell), size = androidx.compose.ui.geometry.Size(cell, cell))
            if (x != 2) drawRect(fg, topLeft = androidx.compose.ui.geometry.Offset((4 - x) * cell, y * cell), size = androidx.compose.ui.geometry.Size(cell, cell))
        }
    }
}
