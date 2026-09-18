package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ScannedIdentityTest {
    private val node = "845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e"

    @Test
    fun `Chat's mesh code becomes a mesh contact`() {
        val card = ScannedIdentity.parse("matrix:u/n:$node")!!
        assertEquals(node, card.meshNodeId)
        assertEquals("", card.matrixId)
        assertEquals("Mesh 845aa4560785", card.fullName)
    }

    @Test
    fun `matrix links and bare ids become Matrix contacts`() {
        assertEquals("@alice:example.org", ScannedIdentity.parse("https://matrix.to/#/%40alice%3Aexample.org")!!.matrixId)
        assertEquals("@alice:example.org", ScannedIdentity.parse("  @alice:example.org ")!!.matrixId)
        assertEquals("@bob:example.org", ScannedIdentity.parse("indiafoss://chat?dm=%40bob%3Aexample.org")!!.matrixId)
    }

    @Test
    fun `a friend card prefers its matrix id and falls back to the mesh node`() {
        assertEquals("@alice:matrix.org", ScannedIdentity.parse("indiafoss://friend?v=1&matrix_id=%40alice%3Amatrix.org&neutrino_server_name=$node")!!.matrixId)
        assertEquals(node, ScannedIdentity.parse("indiafoss://friend?v=1&fn=Asha&neutrino_server_name=${node.uppercase()}")!!.meshNodeId)
        assertNull(ScannedIdentity.parse("indiafoss://friend?v=2&matrix_id=%40alice%3Amatrix.org"))
    }

    @Test
    fun `anything else is not a contact`() {
        assertNull(ScannedIdentity.parse("hello"))
        assertNull(ScannedIdentity.parse("indiafoss://chat?join=%23room%3Aexample.org"))
        assertNull(ScannedIdentity.parse("BEGIN:VCARD\nFN:x\nEND:VCARD"))
    }
}
