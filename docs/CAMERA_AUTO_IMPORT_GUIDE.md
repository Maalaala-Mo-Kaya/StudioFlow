# Camera Auto-Import: User Guide

**For:** photographers, studio admins, and whoever sets up the studio PCs
**System:** StudioFlow V2, Hi-Light Studio

Camera Auto-Import moves each photo from the camera into the correct client's folder as soon as it is taken. Nobody has to copy files by hand or use **Copy Path** during a shoot.

---

## Contents

1. [How it works in one minute](#1-how-it-works-in-one-minute)
2. [Photographer guide: using it during a shoot](#2-photographer-guide-using-it-during-a-shoot)
3. [Setting up a camera in StudioFlow](#3-setting-up-a-camera-in-studioflow)
4. [Choosing where the camera folder lives](#4-choosing-where-the-camera-folder-lives)
5. [Sharing the camera folder over the LAN](#5-sharing-the-camera-folder-over-the-lan)
6. [Setting up the camera software](#6-setting-up-the-camera-software)
7. [Testing before a real shoot](#7-testing-before-a-real-shoot)
8. [Troubleshooting](#8-troubleshooting)
9. [Quick reference](#9-quick-reference)

---

## 1. How it works in one minute

```
 Camera ──► camera software ──► CAMERA FOLDER ──► StudioFlow ──► CLIENT'S FOLDER
 (USB / Wi-Fi)  (EOS Utility…)  C:\StudioFlow_Incoming\Booth1   C:\StudioFlow_Photos\<School>\<Course>\<Job Order>_<Name>\
```

- Each camera has its own **camera folder**, where the camera software saves new photos.
- On the Photo Floor, the photographer **links** the camera to the client being shot by pressing **Select**.
- StudioFlow checks the camera folder every few seconds. It moves each finished photo into that client's folder.
- **Mark Done** sends the last photos and unlinks the camera, ready for the next client.

The client's folder is the same one the **Chooser** station opens for photo selection. Imported photos are ready to choose as soon as the shoot is marked done.

---

## 2. Photographer guide: using it during a shoot

### 2.1 First time on a device: choose your camera

1. Open the **Photo Floor** (Queue) screen.
2. Find the **Camera Auto-Import** panel above the client cards.
3. In **This device**, choose the camera you are shooting with, e.g. *Booth 1 — Canon R6*.

The device remembers this choice. You only do it again if you change booths or devices.

> If the list is empty or says *No camera is set up yet*, a camera has to be added first. See [Section 3](#3-setting-up-a-camera-in-studioflow).

### 2.2 Shooting a client

| Step | What you do | What StudioFlow does |
|---|---|---|
| 1 | Press **Select** on the next card. | Marks the client *On Set* and **links your camera to them**. The panel shows **SENDING PHOTOS TO** and the client's name. The card shows *Booth 1 → sending photos here*. |
| 2 | Shoot normally. | Moves every new photo into the client's folder within about **4 seconds**. The panel counts them: *"14 this session · 14 in client folder · last photo 3s ago"*. |
| 3 | Press **Mark Done** when finished. | Sends any last photos, **unlinks the camera** and moves the client to *Completed Today*. |

Then call the next client. The camera follows the new client automatically.

### 2.3 Other buttons in the panel

- **Link Camera (Booth 1)** on a card: links the camera to a client who is already *On Set*, e.g. if they were called before the camera was chosen, or from another device.
- **Return to Queue** (on the camera panel and on the Selected card): unlinks the camera without finishing the shoot and puts the client back in the queue at their place, e.g. to shoot someone else first, during a break or before a test shot. Their shots so far stay in their folder; **Select** on their card links them again. Photos taken while no client is linked stay in the camera folder.
- **Send them to <name>:** appears when photos are *waiting* (see 2.4). It sends those photos to the client currently linked.
- **Set Up:** opens the camera settings (Section 3).

### 2.4 Waiting photos (unassigned)

StudioFlow never guesses who a photo belongs to. A photo is left in the camera folder as **waiting** when it was:

- taken while **no client was linked** (test shots, between clients), or
- already in the folder **before** the current client was linked.

The panel then shows a yellow notice, for example: *"2 photos are in the camera folder but not assigned to anyone."*

- **If they belong to the current client:** press **Send them to <name>**.
- **If they are test shots or belong to nobody:** leave them, or delete them from the camera folder in File Explorer.

### 2.5 Good habits

- **Link first, then shoot.** Press **Select** before the first frame. Shots taken earlier become *waiting*.
- **Keep the Photo Floor page open** while shooting. It checks every 4 seconds. If the page is closed, the server still checks **once a minute**, so nothing is lost, only slower.
- **Watch the counter.** If it stops going up while you shoot, see [Troubleshooting](#8-troubleshooting).
- **Don't rename or move files** inside the client folder's `selected` and `unselected` folders. The Chooser station manages those.
- **Re-shooting a client after Mark Done:** call them again, or press **Link Camera** while they're on set. New photos are added next to the old ones. A repeated file name gets a number added (`IMG_0001_2.jpg`); nothing is overwritten.

### 2.6 What gets imported

| File | Goes to | Shown in Chooser? |
|---|---|---|
| JPEG, PNG, WebP, GIF, AVIF | Client folder (main) | ✅ Yes |
| RAW (CR2, CR3, NEF, ARW, RAF, DNG, ORF, RW2…), only if *Also import RAW files* is on | Client folder → `RAW` | ❌ No (kept as backup) |
| Anything else (videos, .xmp, .txt…) | Stays in the camera folder | — |
| A file named .jpg that isn't really a photo | Stays in the camera folder | — |

---

## 3. Setting up a camera in StudioFlow

**Who can do this:** admins (**Admin → Camera Import**) and photographers (**Set Up** on the Photo Floor). Only an admin can **remove** a camera.

### 3.1 Add a camera

1. Open **Admin → Camera Import**, or **Set Up** on the Photo Floor.
2. **Camera Name:** something everyone recognises, e.g. `Booth 1 — Canon R6`.
3. **Camera Output Folder (on the server PC):** click **Browse**.
   - The browser shows the **server PC's** drives and folders, not the device you are using.
   - Open a drive, go to the folder you want, and click **Use This Folder**.
   - To make a new folder, open its parent, type a name in the box at the bottom (e.g. `Booth1`) and press **Create**.
   - You can also type the path, e.g. `C:\StudioFlow_Incoming\Booth1`.
4. Choose the options (3.2).
5. Press **Add Camera**.

The camera appears in the **Cameras** list with a status badge:

| Badge | Meaning |
|---|---|
| **Watching** (green) | On, and the folder is reachable. |
| **Folder missing** (red) | The server can't find the folder (deleted, renamed, or the drive is disconnected). |
| **Off** | Turned off; nothing is imported. |

### 3.2 Options

| Option | Turn on when… |
|---|---|
| **Camera is on** | Always, unless you want to pause importing for this camera. |
| **Look inside subfolders** | The camera software saves into dated subfolders (e.g. `2026_11_19\IMG_0001.JPG`). EOS Utility and card-reader copies often do this. StudioFlow looks up to 4 levels deep. |
| **Also import RAW files** | You shoot RAW+JPEG and want the RAW files kept with the client (in their `RAW` folder). Leave it off if you only need JPEGs or keep RAWs elsewhere. |

### 3.3 Folder rules

StudioFlow refuses a camera folder that:

- doesn't exist on the server PC (create it first, or use **Create** in the browser);
- is a whole drive (`C:\`, `D:\`). Use a folder inside it;
- is inside the client photo folders (`C:\StudioFlow_Photos`), or contains them;
- is a Windows system folder (`C:\Windows`, `C:\Program Files`, `C:\ProgramData`);
- is already used by another camera. **Each camera needs its own folder.**

### 3.4 Changing or removing a camera

- **Edit (pencil):** change the name, folder or options, then **Save Changes**. Changing the folder or turning the camera off **unlinks** its current client.
- **Remove (red bin, admin only):** removes the camera from StudioFlow. Imported photos stay in the client folders. Files still in the camera folder are not touched.

### 3.5 Recommended layout for several booths

```
C:\StudioFlow_Incoming\
    Booth1\      ← camera "Booth 1 — Canon R6"
    Booth2\      ← camera "Booth 2 — Nikon Z6"
    Booth3\      ← camera "Booth 3 — Sony A7"
C:\StudioFlow_Photos\   ← client folders (managed by StudioFlow; do not use as a camera folder)
```

---

## 4. Choosing where the camera folder lives

The camera folder must be a folder the **server PC** (the one running `run.bat`) can open. How you set it up depends on which PC the camera is connected to.

### Setup A: camera connected to the server PC (simplest)

```
Camera ──USB──► SERVER PC  (runs run.bat + camera software)
                 └─ C:\StudioFlow_Incoming\Booth1   ← camera software saves here
                                                     ← StudioFlow watches here
```

- No network sharing is needed.
- In StudioFlow, use the local path: `C:\StudioFlow_Incoming\Booth1`.
- In the camera software, save to the same path.

### Setup B: camera connected to a separate booth laptop (recommended for several booths)

```
Camera ──USB──► BOOTH LAPTOP (camera software)
                   │  saves to  Z:\Booth1  =  \\SERVER\StudioFlow_Incoming\Booth1
                   ▼  (over the LAN)
                SERVER PC
                   └─ C:\StudioFlow_Incoming\Booth1   ← StudioFlow watches here (local path)
```

- The folder lives **on the server PC** and is **shared** on the LAN (Section 5).
- In StudioFlow, use the server's **local** path: `C:\StudioFlow_Incoming\Booth1`.
- On the booth laptop, the camera software saves to the **shared** path: `\\<server>\StudioFlow_Incoming\Booth1`, or a mapped drive such as `Z:\Booth1`.

This is the recommended way. The server always reads its own disk, which is fast and reliable, even if a booth laptop restarts or goes offline.

### Setup C: folder on the booth laptop (not recommended)

StudioFlow *can* watch a network path such as `\\BOOTH1-LAPTOP\Captures`. But whenever that laptop sleeps, restarts or loses Wi-Fi, the camera shows **Folder missing** and nothing is imported. Use Setup B instead.

### Wi-Fi / FTP cameras

Cameras that send photos by FTP need an FTP server on the server PC (e.g. FileZilla Server or the Windows IIS FTP feature). Set the FTP user's home folder to the camera folder, e.g. `C:\StudioFlow_Incoming\Booth1`. The camera uploads there, and StudioFlow picks the photos up as usual. FTP server setup is outside StudioFlow; follow your camera's FTP transfer guide.

---

## 5. Sharing the camera folder over the LAN

Follow this section only for **Setup B**. Steps are for **Windows 10/11**. You need an administrator account on the server PC.

### 5.1 On the server PC

**Step 1: give the server a fixed IP address**

Booth laptops need to find the server at the same address every day. Either:

- reserve its IP in the router (*DHCP reservation*), which is preferred, **or**
- set a static IP in **Settings → Network & internet → Ethernet/Wi-Fi → IP assignment → Edit → Manual**.

`run.bat` shows the server's address when it starts (e.g. `192.168.1.50`). This guide uses that example address below.

**Step 2: set the network to Private**

**Settings → Network & internet → Ethernet** (or **Wi-Fi** → your network) → **Network profile type: Private network**.

**Step 3: turn on file sharing**

**Settings → Network & internet → Advanced network settings → Advanced sharing settings → Private networks:**

- **Network discovery:** On
- **File and printer sharing:** On

This also opens the Windows Firewall for file sharing on private networks.

**Step 4: create the folders**

In File Explorer, create:

```
C:\StudioFlow_Incoming
C:\StudioFlow_Incoming\Booth1
C:\StudioFlow_Incoming\Booth2   (one per booth)
```

**Step 5: create a sharing account (recommended)**

Create one local account the booth laptops use to save photos:

1. **Settings → Accounts → Other users → Add account → "I don't have this person's sign-in information" → "Add a user without a Microsoft account".**
2. User name: `camera`, with a strong password. Write it down for Step 2 of 5.2.

> Don't share the folder with **Everyone**, and don't turn off password-protected sharing. Booth laptops sign in with the `camera` account instead.

**Step 6: share the folder**

1. Right-click `C:\StudioFlow_Incoming` → **Properties** → **Sharing** tab → **Advanced Sharing…**
2. Tick **Share this folder**. Share name: `StudioFlow_Incoming`.
3. Click **Permissions** → **Add…** → type `camera` → **OK**. Tick **Change** and **Read** under *Allow*. Remove **Everyone** from the list.
4. Click **OK**, then **OK**.
5. Go to the **Security** tab → **Edit…** → **Add…** → `camera` → tick **Modify** → **OK**.

The share is now `\\192.168.1.50\StudioFlow_Incoming`.

> **Do not share `C:\StudioFlow_Photos` for writing** to booth laptops. StudioFlow manages the client folders, and the camera software must never save there directly.

### 5.2 On each booth laptop

**Step 1: check that the laptop can reach the server**

Connect to the **same network** as the server. Open **Command Prompt** and run:

```
ping 192.168.1.50
```

You should see replies. If not, check the network cable or Wi-Fi first.

**Step 2: open the share and save the password**

1. Press **Win + R**, type `\\192.168.1.50\StudioFlow_Incoming` and press **Enter**.
2. When asked, enter user `192.168.1.50\camera` and its password. Tick **Remember my credentials**.
3. The `Booth1`, `Booth2`… folders appear.

**Step 3: map a drive letter (recommended)**

Camera software handles a drive letter better than a `\\` network path.

1. Open **File Explorer → This PC → ⋯ (See more) → Map network drive**.
2. **Drive:** `Z:`. **Folder:** `\\192.168.1.50\StudioFlow_Incoming`.
3. Tick **Reconnect at sign-in**. If the saved password isn't used automatically, tick **Connect using different credentials** and enter the `camera` account.
4. Click **Finish**. `Z:\Booth1` is now the booth's camera folder.

**Step 4: test writing**

Copy any JPEG into `Z:\Booth1`. On the server PC, check that it appears in `C:\StudioFlow_Incoming\Booth1`. Delete it afterwards, or leave it for the test in Section 7.

**Step 5: keep the laptop awake during shoots**

In **Settings → System → Power**, set *sleep* to **Never** while plugged in. A sleeping laptop drops the network drive.

### 5.3 Summary of paths

| Where | Path to use |
|---|---|
| StudioFlow camera setting (**Browse**) | `C:\StudioFlow_Incoming\Booth1`, the server's local path |
| Camera software on the booth laptop | `Z:\Booth1` (mapped drive) or `\\192.168.1.50\StudioFlow_Incoming\Booth1` |
| Camera software on the server PC itself (Setup A) | `C:\StudioFlow_Incoming\Booth1` |

---

## 6. Setting up the camera software

The rule is the same for every program: **save new photos straight into the camera folder.**

| Software | Where to set the folder | Notes |
|---|---|---|
| **Canon EOS Utility** | *Preferences → Destination Folder* | Usually creates dated subfolders. Turn on **Look inside subfolders** in StudioFlow. |
| **Nikon NX Tether** / Camera Control | *Destination folder* setting | Point it at the camera folder. |
| **Sony Imaging Edge (Remote)** | *Save destination* setting | Point it at the camera folder. |
| **Fujifilm X Acquire** | *Destination folder* setting | Point it at the camera folder. |
| **Card reader (no tethering)** | Copy files from the card into the camera folder **after linking the client** | Works the same as tethering; each file moves when the copy finishes. |
| **Wi-Fi / FTP transfer** | The camera's FTP server settings | See [Wi-Fi / FTP cameras](#wi-fi--ftp-cameras). |

Menu names differ between software versions. Look for *destination*, *save to* or *download folder* in the program's preferences.

### Catalog software (Lightroom Classic, Capture One)

These programs keep a catalog and expect files to **stay where they saved them**. If StudioFlow moves the files, they show as *missing* in the catalog.

If you use one of these:

- let it save captures to its **own** folder (not the camera folder), and
- set its **export / output** folder to the StudioFlow camera folder, e.g. a Capture One *Process Recipe* output location, or a Lightroom export preset.

StudioFlow then imports the exported JPEGs, and the catalog keeps its originals.

### RAW + JPEG

- **Need the RAWs with the client:** turn on **Also import RAW files**. RAWs go to the client's `RAW` folder.
- **Keep RAWs elsewhere:** leave the option off. RAW files stay in the camera folder, and only the JPEGs are moved.

---

## 7. Testing before a real shoot

Do this once after setup, and again after any change to PCs or the network:

1. On the server PC, make sure `run.bat` is running.
2. In **Admin → Camera Import**, check that the camera shows **Watching** (green).
3. Register a **test client** at the kiosk and pay for it at the cashier, so it appears on the Photo Floor. Cancel it in Admin afterwards.
4. On the Photo Floor, choose the camera under **This device**.
5. Take one photo **before** calling the client. The panel should show **1 photo waiting**.
6. Press **Select** on the test client. The panel shows **SENDING PHOTOS TO** and the test client.
7. Take 3–5 photos. Within a few seconds the counter shows them.
8. Press **Copy Path** on the card, open that folder, and check the photos are there.
9. Press **Mark Done**. The panel goes back to *No client linked*.
10. Take one more photo. It stays in the camera folder as **waiting**, which is correct.

If every step behaves as described, the camera is ready.

---

## 8. Troubleshooting

### Messages in the panel

| Message | Cause | What to do |
|---|---|---|
| **The camera folder can't be found on the server PC** / badge **Folder missing** | The folder was deleted or renamed, or the drive is disconnected. | Recreate the folder, or **Edit** the camera and **Browse** to the right one. |
| **The camera folder cannot be read** | The server can't open the folder (permissions). | Make sure the account running `run.bat` can read and write the folder. |
| **No client linked** | No session is active. | Press **Select**, or **Link Camera** on the on-set card. |
| **N photos are … not assigned to anyone** | Photos taken before linking, or with no client linked. | **Send them to <name>** if they belong to the current client; otherwise leave or delete them. |
| **The linked client is no longer on the photo floor** | The client was cancelled or released while linked. | Link the next client. |
| **This camera is turned off** | The camera was switched off in settings. | **Set Up → Edit →** tick **Camera is on**. |
| **Photos for a removed job order are held in …** | An import was interrupted and the job order was then deleted. | Open the path shown and move those photos by hand. |

### Photos are not arriving

1. **Is a client linked?** The panel must show **SENDING PHOTOS TO**.
2. **Is the right camera chosen** under **This device**?
3. **Is the camera software saving to the camera folder?** Open the folder in File Explorer while shooting and watch for new files.
4. **Dated subfolders?** If photos land in `Booth1\2026_11_19\`, turn on **Look inside subfolders**.
5. **Only RAW files arriving?** Turn on **Also import RAW files**, or set the camera to RAW+JPEG.
6. **Photo Floor closed?** Imports then run only once a minute. Keep the page open.
7. **Booth laptop:** is `Z:` still connected? Open it in File Explorer. If it shows a red ✕, reconnect it (5.2, Step 2).

### Booth laptop can't open the share

- `ping` the server (5.2, Step 1). No reply means a network problem, not a sharing problem.
- Check that the server's network is **Private** and **File and printer sharing** is **On** (5.1, Steps 2–3).
- Check the user name format: `192.168.1.50\camera` (server address, backslash, user name).
- Make sure the `camera` account has **Change** permission (Sharing tab) **and** **Modify** permission (Security tab).
- If the server's IP address changed, give it a fixed IP (5.1, Step 1) and re-map `Z:`.

### Other questions

- **A photo was imported to the wrong client.** Open both client folders with **Copy Path** and move the file by hand, *before* the Chooser starts selection for either client.
- **Two photos had the same name.** The second one is saved as `IMG_0001_2.jpg`. Nothing is overwritten.
- **Can two devices control the same camera?** Yes. Both show the same status; the most recent **Select** decides which client is linked.
- **Can one client be shot by two cameras?** Yes. Link each camera to the same client; both send photos to that client's folder.
- **The server was off during the shoot.** Photos wait in the camera folder. When the server is back on, link the client and press **Send them to <name>**.

> **Do not delete the hidden `.studioflow-importing` folder** inside a camera folder. StudioFlow uses it to finish imports that were interrupted. It empties itself.

---

## 9. Quick reference

**Photographer (every client)**

```
Choose camera (once per device) ─► Select ─► Shoot ─► Mark Done ─► next client
```

**Admin (once per camera)**

```
Create folder on server ─► (Booth laptop? share it + map Z:) ─► Admin → Camera Import → Add Camera
─► Browse to the folder ─► set options ─► point the camera software at the folder ─► run the test (Section 7)
```

**Key paths (example)**

| What | Path |
|---|---|
| Camera folders (server) | `C:\StudioFlow_Incoming\Booth1`, `Booth2`, … |
| Shared name on the LAN | `\\192.168.1.50\StudioFlow_Incoming` |
| Mapped drive on the booth laptop | `Z:\Booth1` |
| Client photo folders (managed by StudioFlow) | `C:\StudioFlow_Photos\<School>\<Course>\<Job Order>_<Name>\` |
