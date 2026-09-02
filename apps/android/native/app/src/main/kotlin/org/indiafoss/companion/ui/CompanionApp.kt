package org.indiafoss.companion.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
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
import org.indiafoss.companion.ui.screens.ActivityScreen
import org.indiafoss.companion.ui.screens.MapScreen
import org.indiafoss.companion.ui.screens.NowScreen
import org.indiafoss.companion.ui.screens.PlanScreen
import org.indiafoss.companion.ui.screens.ScheduleScreen

private data class Destination(val route: String, val label: String, val icon: ImageVector)

private val destinations = listOf(
    Destination("now", "Now", Icons.Filled.Schedule),
    Destination("schedule", "Schedule", Icons.Filled.CalendarMonth),
    Destination("plan", "My plan", Icons.Filled.Star),
    Destination("map", "Map", Icons.Filled.Map),
)

@Composable
fun CompanionApp(viewModel: CompanionViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val snackbarHostState = remember { SnackbarHostState() }

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
                NowScreen(state, viewModel::refresh) { navController.navigate("activity/$it") }
            }
            composable("schedule") {
                ScheduleScreen(state, viewModel::toggleBookmark) {
                    navController.navigate("activity/$it")
                }
            }
            composable("plan") {
                PlanScreen(state) { navController.navigate("activity/$it") }
            }
            composable("map") { MapScreen(state) }
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
