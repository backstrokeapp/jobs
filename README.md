# Backstroke Jobs

Each job in this repository performs an action on a schedule within the Backstroke system:

- The [operation-dispatcher](operation-dispatcher/) job scans over all links and if a repository has
  changed, dispatches a new link operation into the queue.
