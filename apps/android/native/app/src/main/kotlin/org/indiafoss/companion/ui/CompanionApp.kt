package org.indiafoss.companion.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import org.indiafoss.companion.CompanionViewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.indiafoss.companion.ui.screens.ActivityScreen
import org.indiafoss.companion.ui.screens.ConnectScreen
import org.indiafoss.companion.ui.screens.ExploreScreen
import org.indiafoss.companion.ui.screens.MapScreen
import org.indiafoss.companion.ui.screens.NowScreen
import org.indiafoss.companion.ui.screens.PlanScreen
import org.indiafoss.companion.ui.screens.RankScreen
import org.indiafoss.companion.ui.screens.ScheduleScreen
import org.indiafoss.companion.ui.screens.SettingsScreen
import org.indiafoss.companion.ui.screens.SpeakerScreen

private data class Destination(val route: String, val label: String, val icon: ImageVector)

private val destinations = listOf(
    Destination("now", "Now", Icons.Filled.Schedule),
    Destination("schedule", "Schedule", Icons.Filled.CalendarMonth),
    Destination("plan", "My plan", Icons.Filled.Star),
    Destination("map", "Map", Icons.Filled.Map),
    Destination("explore", "Explore", Icons.Filled.Explore),
)

@Composable
fun CompanionApp(viewModel: CompanionViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // The QR scanner (zxing, no Google services): a friend's card becomes a contact.
    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let(viewModel::addScanned)
    }
    val scan = {
        scanner.launch(
            ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("Point at a friend's card")
                setBeepEnabled(false)
                setOrientationLocked(false)
            },
        )
    }
    // Your card and Settings live in the top app bar of every tab, as an Android app would have them.
    val topActions: @Composable () -> Unit = {
        IconButton(onClick = { navController.navigate("connect") }) {
            Icon(Icons.Filled.QrCode2, contentDescription = "Your card")
        }
        IconButton(onClick = { navController.navigate("settings") }) {
            Icon(Icons.Filled.Settings, contentDescription = "Settings")
        }
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar {
                val current = backStack?.destination?.route
                destinations.forEach { destination ->
                    NavigationBarItem(
                        selected = current == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = null) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "now",
            modifier = Modifier.padding(padding),
        ) {
            composable("now") {
                NowScreen(state, topActions, viewModel::refresh) { navController.navigate("activity/$it") }
            }
            composable("schedule") {
                ScheduleScreen(state, topActions, viewModel::toggleBookmark) {
                    navController.navigate("activity/$it")
                }
            }
            composable("plan") {
                PlanScreen(state, topActions, onRank = { navController.navigate("rank") }) {
                    navController.navigate("activity/$it")
                }
            }
            composable("explore") {
                ExploreScreen(
                    state = state,
                    actions = topActions,
                    onOpenActivity = { navController.navigate("activity/$it") },
                    onOpenSpeaker = { navController.navigate("speaker/$it") },
                )
            }
            composable("speaker/{id}") { entry ->
                SpeakerScreen(
                    state = state,
                    personId = entry.arguments?.getString("id").orEmpty(),
                    onOpenActivity = { navController.navigate("activity/$it") },
                    onBack = { navController.popBackStack() },
                )
            }
            composable("connect") {
                ConnectScreen(
                    profile = state.profile,
                    contacts = state.contacts,
                    onSave = viewModel::saveProfile,
                    onScan = scan,
                    onRemoveContact = viewModel::removeContact,
                    onBack = { navController.popBackStack() },
                )
            }
            composable("rank") {
                RankScreen(
                    state = state,
                    onAnswerQuick = viewModel::answerQuick,
                    onRoom = viewModel::setRoom,
                    onRoomsDecided = viewModel::roomsDecided,
                    onChoose = viewModel::choose,
                    onUndo = viewModel::undoLast,
                    onOpen = { navController.navigate("activity/$it") },
                    onBack = { navController.popBackStack() },
                )
            }
            composable("map") { MapScreen(state, topActions) }
            composable("settings") { SettingsScreen(state, viewModel::setRemindersEnabled) }
            composable("activity/{id}") { entry ->
                ActivityScreen(
                    state = state,
                    activityId = entry.arguments?.getString("id").orEmpty(),
                    onBookmark = viewModel::toggleBookmark,
                    onMustAttend = viewModel::toggleMustAttend,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
