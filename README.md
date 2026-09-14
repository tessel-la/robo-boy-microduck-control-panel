# Robo-Boy Microduck Control Panel

An optional external Robo-Boy panel for the sibling `mujoco-warp-locomotion-sim` project. It is intentionally not a
built-in/default panel: install it through the Panel Manager, then add **Microduck Control** from the workspace panel
menu when you need it.

The panel provides hold-to-drive controls, every policy mode shipped with the simulator, mouth open/close buttons,
and a jump button. The UI labels jump as a simulator primitive because Pollen's bundled ONNX policies do not contain
a trained jump policy.

## Run the complete example

Build the panel once:

```bash
cd ../robo-boy-microduck-control-panel
npm install
npm run validate
```

Start the Microduck stack, then start Robo-Boy with this repository as a one-off local panel source:

```bash
cd ../mujoco-warp-locomotion-sim
docker compose --env-file ../robo-boy/.env up --build

cd ../robo-boy
ROBOBOY_PANEL_SOURCES_FILE=../robo-boy-microduck-control-panel/examples/panel-sources.json \
  docker compose -f docker-compose.yml -f infra/compose/panels.yml \
  -f ../robo-boy-microduck-control-panel/examples/docker-compose.panel.yml up --build
```

Starting the simulator first creates the shared `microduck-interfaces` Docker volume. The opt-in Robo-Boy Compose
file mounts that generated overlay into rosbridge, which is required for action discovery and goal serialization.

Connect Robo-Boy to ROS, open the workspace panel menu, and add **Microduck Control**. This example source file is
opt-in and does not alter Robo-Boy's checked-in default or local panel inventory.

For Robo-Boy frontend development, add this repository to a private/local `panel-sources.json` and mount it under the
same `/panel-workspace/robo-boy-microduck-control-panel` path, then run `npm run dev:panels` in Robo-Boy.

## Behavior Tree examples

The simulator exposes `/locomotion/execute_motion` as
`microduck_interfaces/action/ExecuteMotion`. Its `motion` goal accepts:

| Kind | Values |
| --- | --- |
| Official RL policy | `walk`, `stand`, `sit`, `ground_pick`, `kick_left`, `kick_right`, `roulade`, `recover` |
| Simulator primitive | `jump` |

Import either JSON file from Robo-Boy's Behavior Tree toolbar:

- `behavior-trees/microduck-jump-and-smile.json` combines the mouth service with the jump and walk action nodes.
- `behavior-trees/microduck-sit-stand-walk.json` demonstrates policy-to-policy switching with action nodes.

To create another mode node, duplicate one of those action nodes and change only `parameters.motion`. Mouth is also
available as `/locomotion/mouth` (`std_srvs/srv/SetBool`); convenience Trigger services exist at
`/locomotion/mouth/open` and `/locomotion/mouth/close`.

The simulator repository ships five more trees in
[`../mujoco-warp-locomotion-sim/behavior_trees`](../mujoco-warp-locomotion-sim/behavior_trees), covering the
`/locomotion/move_relative` motion primitives, policy-then-move sequencing, and cancellation with a fallback branch.

## Panel ROS permissions

| Direction | Resource | Type |
| --- | --- | --- |
| Publish | `/cmd_vel` | `geometry_msgs/msg/Twist` |
| Publish | `/locomotion/policy_cmd` | `std_msgs/msg/String` |
| Subscribe | `/locomotion/status` | `std_msgs/msg/String` |
| Service | `/locomotion/mouth` | `std_srvs/srv/SetBool` |
| Service | `/locomotion/jump` | `std_srvs/srv/Trigger` |

The manifest grants only those exact ROS resources. It grants no network, storage, device, or broad discovery access.
