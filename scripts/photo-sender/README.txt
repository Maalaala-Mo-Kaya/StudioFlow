StudioFlow Photo Sender
=======================

What it does
  EOS Utility can't save straight to the server. So EOS saves on the laptop,
  and the Photo Sender sends each finished shot to StudioFlow over the studio
  network. StudioFlow then puts it in the client's folder, where it shows up in
  the Photo Floor's on-set popup within a few seconds.

  Camera -> EOS Utility -> C:\EOS_Out (laptop) -> Photo Sender
         -> StudioFlow server -> client's folder

SETUP (the easy way: download it from StudioFlow)
  On the server PC, once:
  1. Make a folder for the camera, e.g. C:\StudioFlow_Incoming\Camera1
     (NOT inside the client photo folder C:\StudioFlow_Photos).
     No Windows sharing is needed.
  2. StudioFlow > Admin > Camera Import > add a camera with that folder.
     Tick "Import RAW" if you want RAWs.

  On the photographer's laptop, once:
  1. Open StudioFlow on the laptop (Photo Floor > Camera Settings, or Admin >
     Camera Import), press "Photo Sender" on the camera, check the server
     address and press Download.
  2. Open the downloaded zip, press "Extract all", and in the extracted folder
     double-click install-photo-sender.bat. If Windows warns about the file,
     choose "More info" > "Run anyway" (or "Run").
  3. Type the EOS folder (press Enter for C:\EOS_Out). It checks the
     connection and starts. The extracted folder can be deleted afterwards:
     the sender is installed in %LOCALAPPDATA%\StudioFlow\PhotoSender.
  4. EOS Utility > Preferences > Destination Folder > C:\EOS_Out

  The download holds this camera's key. Keep it to the studio laptops. If a
  laptop is lost, an admin presses "Reset key" in the same popup; laptops with
  the old download stop sending (their shots wait) until they get a new one.

SETUP (older way: a Windows shared folder)
  Used when the folder has no photo-sender.config.json from StudioFlow.
  1. On the server, share the camera folder (Properties > Sharing > Advanced
     Sharing) and give the photographer's Windows account Full Control.
  2. On the laptop, open \\SERVER\Camera1 once in File Explorer, sign in and
     tick "Remember my credentials".
  3. Double-click install-photo-sender.bat and answer the two questions:
       EOS folder:    C:\EOS_Out
       Server folder: \\SERVER\Camera1

EVERY DAY
  Nothing to start: the sender runs by itself after sign-in.
  Photo Floor > pick the camera > Call Client > shoot.
  Shots appear in the client's popup. Delete the bad ones there (they go to the
  client's _DELETED folder and can be restored until Mark Done).
  Mark Done: the Chooser then sees only the shots that are left.

IS IT RUNNING?
  Look at the Photo Floor's Camera Auto-Import panel for that camera:
    green  "Photo Sender online - LAPTOP-NAME - last shot 1m ago - 0 waiting"
    red    "Photo Sender not heard from for 3m": the laptop is off, asleep,
           signed out, off the Wi-Fi, or the sender was stopped.
  The sender reports every few seconds. StudioFlow keeps it in a small file,
  .studioflow-sender.json, in the camera folder. Don't delete it; it is never
  imported as a photo.

CHANGING THE SETTINGS
  Double-click install-photo-sender.bat again (from a new download, or from
  %LOCALAPPDATA%\StudioFlow\PhotoSender). It saves the settings and restarts
  the sender. If the EOS folder changed, set the same folder in EOS Utility too.

IF SHOTS DON'T ARRIVE
  - Open photo-sender.log in %LOCALAPPDATA%\StudioFlow\PhotoSender.
    "can't be reached": check the laptop's Wi-Fi and that the server is running.
    "camera key was refused": the key was reset. Download the sender again.
    "turned off": turn the camera on in Camera Import.
  - Shots never get lost: until they are sent they stay in C:\EOS_Out.
  - In StudioFlow's Photo Floor, the camera panel shows if the server folder is
    offline, and how many files are waiting with no client linked.

REMOVE
  Double-click uninstall-photo-sender.bat.
