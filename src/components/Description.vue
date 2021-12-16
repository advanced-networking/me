<template>
  <section>
    <h3 class="headline">What is this?</h3>

    <p>
      This is an Mininet editor hosted for SCC365 students.
      <br>
      You can use this to edit mininet topologies, and export them.
    </p>

    <p>
      Exports JSONs (whole projects), Python scripts (Mininet emulation), addressing plans and topology images.
      <br>
      Imports JSONs and Python scripts.
      <br>
      Persists projects even if the browser is closed and also works offline.
    </p>

    <p v-if="full">
      <v-btn class="ma-2" outlined color="primary" target="_blank" href="https://github.com/scc365/me">
        Repository
      </v-btn>
      <v-btn class="ma-2" outlined color="primary" target="_blank" href="https://github.com/scc365/me/issues/new">
        New Issue
      </v-btn>
    </p>
  </section>
</template>

<script>
export default {
  name: 'Description',
  props: {
    full: {
      type: Boolean,
      default: false
    }
  }
}
</script>
