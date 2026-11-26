StudioFlow Photo Sender
=======================

What it does
  EOS Utility can't save straight into a network folder. So EOS saves on the
  laptop, and the Photo Sender moves each finished shot to the server's camera
  folder. StudioFlow then puts it in the client's folder, where it shows up in
  the Photo Floor's on-set popup within a few seconds.

  Camera -> EOS Utility -> C:\EOS_Out (laptop) -> Photo Sender
         -> \\SERVER\Camera1 (server) -> StudioFlow -> client's folder

ON THE SERVER PC (once)
  1. Make a folder for the camera, e.g. C:\StudioFlow_Incoming\Camera1
     (NOT inside the client photo folder C:\StudioFlow_Photos).
  2. Right-click it > Properties > Sharing > Advanced Sharing > Share this folder.
     Permissions: give the photographer's Windows account Full Control
     (or "Everyone" Full Control on a closed studio network).
  3. StudioFlow > Admin > Camera Import > add a camera with that folder
     (the server's own path, C:\StudioFlow_Incoming\Camera1). If EOS makes
     date subfolders, tick "Include subfolders". Tick "Import RAW" if you want RAWs.

ON THE PHOTOGRAPHER'S LAPTOP (once)
  1. Copy this whole photo-sender folder to the laptop, e.g. C:\StudioFlow\photo-sender
  2. In File Explorer, open \\SERVER\Camera1 once (use the server's PC name or IP,
     e.g. \\192.168.1.10\Camera1). Sign in if asked and tick "Remember my credentials".
  3. Double-click install-photo-sender.bat and answer the two questions:
       EOS folder:    C:\EOS_Out
       Server folder: \\SERVER\Camera1
  4. EOS Utility > Preferences > Destination Folder > C:\EOS_Out

EVERY DAY
  Nothing to start: the sender runs by itself after sign-in.
  Photo Floor > pick the camera > Call Client > shoot.
  Shots appear in the client's popup. Delete the bad ones there (they go to the
  client's _DELETED folder and can be restored until Mark Done).
  Mark Done: the Chooser then sees only the shots that are left.

IS IT RUNNING?
  Look at the Photo Floor's Camera Auto-Import panel for that camera:
    green  "Photo Sender online · LAPTOP-NAME · last shot 1m ago · 0 waiting"
    red    "Photo Sender not heard from for 3m": the laptop is off, asleep,
           signed out, off the Wi-Fi, or the sender was stopped.
  The sender writes a small file, .studioflow-sender.json, into the server
  folder every few seconds. Don't delete it; it is never imported as a photo.

CHANGING THE FOLDERS
  Double-click install-photo-sender.bat again and type the new folders. It saves
  them and restarts the sender. If the EOS folder changed, set the same folder in
  EOS Utility too. If the server folder moved, also edit the camera in
  Admin > Camera Import.

IF SHOTS DON'T ARRIVE
  - Open photo-sender.log next to the script. "can't be reached" means the laptop
    can't open \\SERVER\Camera1: check Wi-Fi and step 2 above.
  - Shots never get lost: until they are sent they stay in C:\EOS_Out.
  - In StudioFlow's Photo Floor, the camera panel shows if the server folder is
    offline, and how many files are waiting with no client linked.

REMOVE
  Double-click uninstall-photo-sender.bat.
