# Microduck Control for Robo-Boy

Drive the Microduck simulation, select learned motion modes, move its mouth, and trigger a simulator jump from a Robo-Boy workspace tile.

This independently installed external panel uses Robo-Boy's sandbox and brokered ROS API.
It requests only the exact ROS resources declared in [roboboy.panel.json](roboboy.panel.json).

## Install and run

Use a Robo-Boy deployment with Panel API v2 and the official Panel Inventory configured.
See [Robo-Boy's installation guide](https://github.com/tessel-la/robo-boy/blob/main/docs/external-panels.md#remote-inventories-and-private-panels)
for the authenticated Panel Manager setup.

1. Start the [Microduck simulator](https://github.com/tessel-la/mujoco-warp-locomotion-sim) using its CPU quickstart and the same ROS discovery settings as Robo-Boy. Run one simulator per ROS domain.
2. Open **Manage installations…**, browse the official inventory, select **Microduck Control**, review its ROS permissions, and apply the installation.
3. Connect Robo-Boy to the simulator's ROS stack and add **Microduck Control** from the workspace panel menu.
4. Request control from Robo-Boy's control menu before driving.

Installing the panel does not start the simulator. Published panel users do not need Node.js,
this source checkout, or the SDK. Releases must be published and registered before this panel
appears in the official inventory; maintainers follow [the release guide](docs/releasing.md).

## Develop

Use Node.js 22 or later and npm. No sibling source checkout is needed to build: the type-only
SDK is pinned to its public GitHub release and dependencies are locked.

```bash
git clone https://github.com/tessel-la/robo-boy-microduck-control-panel.git
cd robo-boy-microduck-control-panel
npm ci
npm run release:prepare
```

This runs typecheck, tests, build, SRI generation, and artifact validation. After source changes,
rebuild and update SRI before installing. Use the local source configuration with a sibling
Robo-Boy checkout for frontend development:

```bash
cd ../robo-boy
npm run dev:panels -- --config ../robo-boy-microduck-control-panel/examples/panel-sources.json
```

For Docker, use `examples/docker-compose.panel.yml` with Robo-Boy's local panel overlay;
see [custom panels](https://github.com/tessel-la/robo-boy/blob/main/docs/custom-panels.md).
Keep the manager authenticated and preserve other selections in an existing deployment.

## How it fits

The panel owns its UI and command lifecycle. The simulator owns physics, policies, watchdogs,
and ROS services. Robo-Boy owns the sandbox, control gateway, installation, and workspace.
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) describe source contributions.

## Behavior tree examples

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
[the simulator behavior trees](https://github.com/tessel-la/mujoco-warp-locomotion-sim/tree/main/behavior_trees), covering the
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

## Limitations

- This panel controls the simulator, not physical hardware. **Stop** behavior sends zero velocity; it is not a hardware emergency stop.
- Drive requires fresh enabled simulator status. It stops on release, keyboard release, focus loss, resize, stale telemetry, disconnect, inactivity, or removal. Reconnecting never resumes a held input.
- Hold Enter or Space on a focused drive button; release it to stop. Escape stops a held direction. Turning includes forward motion; lateral walking is not offered because the current policy does not reliably produce it.
- Jump is a bounded simulator primitive, not a learned policy. Action goals run through Robo-Boy's behavior-tree tools because Panel API v2 has no action API.
- The simulator's third-party CAD assets have non-commercial terms; see its third-party notices. This panel's own code is MIT licensed.


## License

MIT; see [LICENSE](LICENSE). The SDK is a separate type-only dependency with its own notice.
