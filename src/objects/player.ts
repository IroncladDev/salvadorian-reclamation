import Game from "@/lib/game"
import { canvas } from "@/lib/canvas/index"
import { dist, pointAt } from "@/lib/utils"
import { sfx } from "@/lib/sfx"
import { zzfx } from "@/lib/zzfx"
import { Entity } from "./entity"
import {
    GunWeapon,
    LongWeaponKey,
    MeeleeWeapon,
    MeeleeWeaponKey,
    ShortWeaponKey,
    WeaponKey,
    weapons,
} from "@/lib/weapons"
import { Enemy } from "./enemy"
import { levels } from "@/lib/levels"
import { colors } from "@/lib/constants"

export class Player extends Entity {
    hasFired = false
    health = [20, 40, 30] as [number, number, number]
    maxHealth = [20, 40, 30] as [number, number, number]
    arsenal: [[type: LongWeaponKey, ammo: number], [type: ShortWeaponKey, ammo: number], [type: MeeleeWeaponKey]] = [
        [levels[Game.level].longWeapon || 0, levels[Game.level].mainWeaponAmmo],
        [levels[Game.level].shortWeapon || 4, levels[Game.level].sideWeaponAmmo],
        [8],
    ]
    currentWeapon = 0
    weapon: WeaponKey = this.arsenal[this.currentWeapon][0]
    dashDelay = 50
    dashTime = 50
    footstep = [false, false] as [boolean, boolean]

    // UI Vars
    weaponNumberTo = 0
    hoveringEnemy: Enemy | undefined = undefined
    hoverFrame = 0
    timeSinceDamaged = 0
    tutorialEnemy: Enemy | undefined = undefined
    winTimer = 40
    speed = 7

    constructor(x: number, y: number) {
        super(x, y)
    }

    run() {
        const isTutorial = Game.level == 0 && Game.tutorialStep <= 8

        // Dead & Dying states
        if (this.health.some(h => h <= 0)) {
            Game.scene = 4
            this.dead = true
        }

        // Movement
        if (Game.keysDown("ArrowRight", "d")) {
            this.movingDir = 1
        } else if (Game.keysDown("ArrowLeft", "a")) {
            this.movingDir = -1
        } else {
            this.movingDir = 0
        }
        if (Game.keysDown("ArrowUp", "w", " ") && this.canJump) {
            zzfx(...sfx[7])
            this.jump()
        }

        if (this.dashTime > 0) this.dashTime--

        if (this.dashTime == 0 && Game.keysDown("Shift") && this.movingDir != 0) {
            if (isTutorial && Game.tutorialStep == 1) {
                this.arsenal[0][1] = 3
                Game.tutorialStep = 2
            }
            this.knockback -= 20 * this.movingDir
            this.dashTime = this.dashDelay
            zzfx(...sfx[12])
        }

        if (Game.keysDown("1")) this.currentWeapon = 0
        if (Game.keysDown("2")) {
            this.currentWeapon = 1
            if (isTutorial && Game.tutorialStep == 4) {
                this.x = 75
                this.tutorialEnemy = new Enemy("t", 375, 50)
                Game.entities.push(this.tutorialEnemy)
                Game.tutorialStep = 5
            }
        }
        if (Game.keysDown("3")) this.currentWeapon = 2

        if (isTutorial) {
            if (Game.keysDown("w", "d", "ArrowLeft", "ArrowRight") && Game.tutorialStep == 0) {
                Game.tutorialStep = 1
            }

            if (Game.tutorialStep == 5 && this.tutorialEnemy?.isHovered) {
                this.arsenal[0][1] = 25
                this.currentWeapon = 0
                Game.tutorialStep = 6
            }

            if ((Game.tutorialStep == 6 && this.tutorialEnemy?.hasSurrendered) || this.tutorialEnemy?.dead) {
                Game.tutorialStep = 7
            }

            if (Game.tutorialStep == 7 && this.tutorialEnemy?.weaponTaken) {
                Game.tutorialStep = 8
            }

            if (Game.tutorialStep == 8 && Game.keysPressedDown("e")) {
                Game.scene = 3
            }
        }

        this.weapon = this.arsenal[this.currentWeapon][0]

        // Mouse
        const mouseX = Game.mouseX - Game.cameraX
        const mouseY = Game.mouseY - Game.cameraY

        if (mouseX > this.centerX) this.dir = 1
        else if (mouseX < this.centerX) this.dir = -1

        this.weaponRotation = Math.atan2(mouseY - this.centerY, mouseX - this.centerX)

        if (this.wp.type == 0) {
            const [x, y] = pointAt(
                this.centerX,
                this.centerY,
                Math.atan2(mouseY - this.centerY, mouseX - this.centerX) + (Math.PI / 2) * this.dir,
                this.wp.barrelY,
            )
            this.weaponRotation = Math.atan2(mouseY - y, mouseX - x)
        }

        this.animateVars()
        this.handleBulletCollisions(() => {
            this.timeSinceDamaged = 0
            zzfx(...sfx[10])
        })

        if (this.fireCooldown > 0) this.fireCooldown--
        if (this.timeSinceDamaged < 150) this.timeSinceDamaged++
        else
            this.health.forEach((h, i) => {
                this.health[i] += (1 - h / this.maxHealth[i]) * 0.1
            })

        // Attacks
        if (Game.pressed && this.fireCooldown == 0 && (this.wp.type == 1 || this.wp.isSemi ? !this.hasFired : true)) {
            if (Game.mouseButton == 2) {
                if (isTutorial && Game.tutorialStep == 3) {
                    Game.tutorialStep = 4
                }
                this.currentWeapon = 2
            }
            this.weapon = this.arsenal[this.currentWeapon][0]

            // Meelee weapons
            if (this.wp.type == 1) {
                this.fireFrame = 1
                zzfx(...sfx[4])
                const [x, y] = pointAt(this.centerX, this.centerY, this.weaponRotationTo, this.wp.length)
                for (const enemy of Game.entities) {
                    if (!(enemy instanceof Enemy) || enemy.dead) continue
                    const strikeX = Math.min(Math.max(x, enemy.x), enemy.x + enemy.w)
                    const strikeY = Math.min(Math.max(y, enemy.y), enemy.y + enemy.h)
                    const strikeDist = dist(x, y, strikeX, strikeY)

                    if (isTutorial && Game.tutorialStep < 6) continue

                    if (strikeDist < this.wp.range) {
                        const dirFromPlayer = enemy.x < this.x ? 1 : -1
                        zzfx(...sfx[9])
                        enemy.health[1] -= this.wp.damage
                        enemy.knockback = enemy.hasSurrendered
                            ? this.wp.knockback / 4
                            : this.wp.knockback * dirFromPlayer
                        enemy.rotateTo += this.wp.knockback * 2 * (Math.PI / 180) * -dirFromPlayer
                        if (!enemy.hasSurrendered && !enemy.dead) {
                            setTimeout(() => {
                                if (this.dead || enemy.dead) return
                                enemy.dir = this.x < enemy.x ? -1 : 1
                            }, 500)
                        }
                    }
                }
            } else {
                const current = this.arsenal[this.currentWeapon as 0 | 1]
                if (current[1] > 0) {
                    this.fireFrame = 1
                    zzfx(...sfx[this.wp.sound || 0])
                    this.shoot(this.weaponRotationTo)
                    this.notifyClosest(this.x)
                    if (!isTutorial || this.tutorialEnemy) Game.shotsFired++
                    current[1]--
                } else if (!this.hasFired) {
                    zzfx(...sfx[3])
                }
            }

            if (isTutorial && Game.tutorialStep == 2 && this.arsenal[0][1] == 0) {
                Game.tutorialStep = 3
            }

            this.hasFired = true
        }

        if (Game.released && this.hasFired) {
            this.hasFired = false
        }
    }

    render() {
        const speedWeightRatio = this.wp.type || (this.speed - this.wp.weight) / this.speed

        this.footstep[1] = Math.floor(Math.cos((Game.frameCount / 2.5) * speedWeightRatio)) == 0 && this.movingDir != 0

        if (this.footstep[1] && !this.footstep[0] && this.canJump) {
            zzfx(...sfx[Math.random() > 0.5 ? 5 : 6])
            this.footstep[0] = true
            setTimeout(() => (this.footstep[0] = false), 200)
        }

        canvas
            .push()
            .translate(this.centerX, this.y + this.h)
            .rotate(this.baseRotation)
            // Legs
            .lineWidth(7.5)
            .lineCap("round")
            .strokeStyle(colors.bodySecondary)
            .push()
            .translate(
                -2.5 * this.baseScaleTo + Math.cos((Game.frameCount / 5) * speedWeightRatio) * this.movingDirTo * 5,
                -25,
            )
            .scale(this.dirTo, 1 - Math.sin((Game.frameCount / 5) * speedWeightRatio) * this.movingDirTo * 0.15)
            .rotate(
                this.movingDirTo * ((Math.sin((Game.frameCount / 5) * speedWeightRatio) * Math.PI) / 4) + Math.PI / 4,
            )
            .path()
            .arc(0, 15, 15, -Math.PI / 2, 0)
            .close(0)
            .pop()
            .strokeStyle(colors.body)
            .push()
            .translate(
                -2.5 * this.baseScaleTo - Math.cos((Game.frameCount / 5) * speedWeightRatio) * this.movingDirTo * 5,
                -25,
            )
            .scale(this.dirTo, 1 + Math.sin((Game.frameCount / 5) * speedWeightRatio) * this.movingDirTo * 0.15)
            .rotate(
                this.movingDirTo * ((1 - Math.sin((Game.frameCount / 5) * speedWeightRatio) * Math.PI) / 4) +
                    Math.PI / 4,
            )
            .path()
            .arc(0, 15, 15, -Math.PI / 2, 0)
            .close(0)
            .pop()
            .push()
            .translate(-this.w / 2, -this.h)
            // Body
            .fillStyle("rgb(45,100,15)")
            .roundRect(10 - 2.5 * this.baseScaleTo, 20, 20, 40, 25)
            .fillStyle(colors.body)
            .roundRect(7.5 - 2.5 * this.baseScaleTo, 20, 25, 30, [25, 25, 5, 5])
            // Head
            .fillStyle("#F4DEB3")
            .roundRect(12.5, 2.5, 15, 15, 15)
            // Helmet
            .fillStyle(colors.body)
            .roundRect(10, 0, 20, 10, [20, 20, 2.5 + this.baseScaleTo * 2.5, 2.5 - this.baseScaleTo * 2.5])
            .roundRect(15 - 5 * this.baseScaleTo, 10, 10, 5, [
                0,
                0,
                7.5 - this.baseScaleTo * 2.5,
                7.5 + this.baseScaleTo * 2.5,
            ])
            .pop()
            .pop()
            .lineWidth(2)

        if (this.wp.type == 0) {
            const [x, y] = this.gunTip()
            const [x2, y2] = pointAt(x, y, this.weaponRotationTo, this.wp.lifetime * this.wp.bulletSpeed)
            const distToMouse = dist(x, y, Game.mouseX - Game.cameraX, Game.mouseY - Game.cameraY)
            const [mx, my] = pointAt(x, y, this.weaponRotationTo, distToMouse)
            const gunTipToCenter = dist(x, y, this.centerX, this.centerY)
            const distToCenter = dist(Game.mouseX, Game.mouseY, canvas.width / 2, canvas.height / 2)

            canvas
                .strokeStyle(
                    this.hoveringEnemy
                        ? colors.fgui(0.6 * this.hoverFrame)
                        : colors.dwhite(
                              Math.min(Math.max(Math.PI / 180 / this.recoilRotation / this.wp.recoilY, 0), 1) * 0.2,
                          ),
                )
                .fillStyle(this.hoveringEnemy ? colors.fgui(0.2 * this.hoverFrame) : colors.transparent)
                .path()
                .moveTo(x, y)
                .arc(
                    mx,
                    my,
                    distToCenter < gunTipToCenter ? 0 : 10 + this.hoverFrame * 10,
                    this.weaponRotationTo + Math.PI,
                    this.weaponRotationTo,
                )
                .lineTo(x2, y2)
                .arc(
                    mx,
                    my,
                    distToCenter < gunTipToCenter ? 0 : 10 + this.hoverFrame * 10,
                    this.weaponRotationTo,
                    this.weaponRotationTo + Math.PI,
                )
                .close(2)
        } else {
            const [x, y] = pointAt(this.centerX, this.centerY, this.weaponRotationTo, this.wp.length)

            canvas
                .strokeStyle(colors.dwhite(0.2))
                .path()
                .arc(x, y, this.wp.range, this.weaponRotationTo - Math.PI, this.weaponRotationTo + Math.PI)
                .close(0)
        }

        canvas
            .push()
            .translate(this.centerX - 2.5 * this.baseScaleTo, this.y + 27.5)
            .rotate(this.weaponRotationTo)
            .scale(1, this.dirTo)
            .rotate(0)
        this.wp.render(this.fireFrame, colors.bodySecondary, colors.black)
        canvas.pop()
    }

    renderUI() {
        this.weaponNumberTo += this.weaponNumberTo.tween(this.currentWeapon, 5)

        canvas
            .fillStyle(colors.ui(this.currentWeapon == 0 ? 0.6 : 0.4))
            .roundRect(10, 10, 100, 70, 10)
            .fillStyle(colors.ui(this.currentWeapon == 1 ? 0.6 : 0.4))
            .roundRect(120, 10, 100, 70, 10)
            .fillStyle(colors.ui(this.currentWeapon == 2 ? 0.6 : 0.4))
            .roundRect(230, 10, 100, 70, 10)

        canvas
            .push()
            .strokeStyle(colors.fgui(0.6))
            .lineWidth(3)
            .lineCap("round")
            .translate(this.weaponNumberTo * 110, 0)
            .path()
            .arc(20, 20, 15, Math.PI, Math.PI * 1.5)
            .close(0)
            .path()
            .arc(100, 20, 15, Math.PI * 1.5, Math.PI * 2)
            .close(0)
            .path()
            .arc(100, 70, 15, 0, Math.PI / 2)
            .close(0)
            .path()
            .arc(20, 70, 15, Math.PI / 2, Math.PI)
            .close(0)
            .pop()

        const longWeapon = weapons[this.arsenal[0][0]] as GunWeapon
        const sideWeapon = weapons[this.arsenal[1][0]] as GunWeapon
        const meeleeWeapon = weapons[this.arsenal[2][0]] as MeeleeWeapon

        canvas
            .push()
            .translate(20, 60)
            .rotate(-Math.PI / 6)
            .translate(...longWeapon.offset)
        longWeapon.render(0, colors.transparent, colors.black)
        canvas
            .pop()
            .push()
            .translate(120, 60)
            .rotate(-Math.PI / 6)
            .translate(...sideWeapon.offset)
        sideWeapon.render(0, colors.transparent, colors.black)
        canvas
            .pop()
            .push()
            .translate(240, 60)
            .rotate(-Math.PI / 6 + Math.PI / 2)
            .translate(...meeleeWeapon.offset)
        meeleeWeapon.render(0, colors.transparent, colors.black)

        canvas
            .pop()
            .font(10)
            .fillStyle(colors.white)
            .text(longWeapon.name, 60, 40)
            .text(sideWeapon.name, 170, 40)
            .text(meeleeWeapon.name, 280, 40)
            .text("[1]", 25, 20)
            .text("[2]", 135, 20)
            .text("[3]", 245, 20)
            .text("" + this.arsenal[0][1], 95, 65)
            .text("" + this.arsenal[1][1], 205, 65)
            .font(8)
            .text("/ right-click", 290, 20)

        // Health indicator
        canvas
            .fillStyle(
                `rgba(${(1 - this.health[0] / this.maxHealth[0]) * 125},${(this.health[0] / this.maxHealth[0]) * 125},75,0.6)`,
            )
            .roundRect(10, canvas.height - 130, 100, 25, [10, 10, 0, 0])
            .roundRect(35, canvas.height - 125, 20, 20, 20)
            .fillStyle(
                `rgba(${(1 - this.health[1] / this.maxHealth[1]) * 125},${(this.health[1] / this.maxHealth[1]) * 125},75,0.6)`,
            )
            .roundRect(10, canvas.height - 105, 100, 45, 0)
            .path()
            .roundRect(20, canvas.height - 100, 50, 20, [10, 10, 0, 0])
            .roundRect(20, canvas.height - 80, 7.5, 20, [0, 0, 10, 10])
            .roundRect(62.5, canvas.height - 80, 7.5, 20, [0, 0, 10, 10])
            .roundRect(32.5, canvas.height - 80, 25, 20, 0)
            .close(1)
            .fillStyle(
                `rgba(${(1 - this.health[2] / this.maxHealth[2]) * 125},${(this.health[2] / this.maxHealth[2]) * 125},75,0.6)`,
            )
            .roundRect(10, canvas.height - 60, 100, 50, [0, 0, 10, 10])
            .path()
            .roundRect(32.5, canvas.height - 60, 25, 10, 0)
            .roundRect(32.5, canvas.height - 50, 10, 35, [0, 0, 10, 10])
            .roundRect(47.5, canvas.height - 50, 10, 35, [0, 0, 10, 10])
            .close(1)
            .fillStyle(colors.white)
            .align("right")
            .text("- " + ((this.health[0] / this.maxHealth[0]) * 100).toFixed(0) + "%", 105, canvas.height - 120)
            .text(((this.health[1] / this.maxHealth[1]) * 100).toFixed(0) + "%", 105, canvas.height - 80)
            .text("- " + ((this.health[2] / this.maxHealth[2]) * 100).toFixed(0) + "%", 105, canvas.height - 40)

        const hoveredEnemy = Game.entities.find(e => e instanceof Enemy && e.isHovered) as Enemy | undefined

        if (hoveredEnemy) {
            this.hoveringEnemy = hoveredEnemy
            this.hoverFrame += this.hoverFrame.tween(1, 10)
            canvas
                .fillStyle(colors.ui(0.8 * this.hoverFrame))
                .roundRect(canvas.width - 160, 10, 150, 100, 10)
                .fillStyle(colors.white)
                .align("left")
                .font()
                .text(hoveredEnemy.name, canvas.width - 150, 20)
                .fillStyle(colors.dwhite(0.7))
                .roundRect(canvas.width - 150, 32, canvas.context.measureText(hoveredEnemy.name).width, 2, 10)
                .fillStyle(colors.white)
                .font(10)
                .text("Rank: " + hoveredEnemy.stats.name, canvas.width - 150, 40)
                .text(
                    "Weapon: " + (hoveredEnemy.weaponTaken ? "--" : weapons[hoveredEnemy.weapon].name),
                    canvas.width - 150,
                    95,
                )
                .font(8)
                .fillStyle(colors.dwhite(0.7))
                .text(hoveredEnemy.stats.description, canvas.width - 145, 55, 130)
        } else {
            this.hoverFrame += this.hoverFrame.tween(0, 10)
            this.hoveringEnemy = undefined
        }

        if (Game.level == 0) {
            let tutorialMessage =
                "Try to take all gang members alive, shoot accurately, and complete each mission quickly. Good luck, soldier!"
            let instruction = "Press [E]"

            if (Game.tutorialStep == 0) {
                tutorialMessage = "WASD / Arrow Keys to move"
                instruction = "Move around"
            }
            if (Game.tutorialStep == 1) {
                tutorialMessage = "While moving, press [Shift] to dash"
                instruction = "Hold [D] & [Shift]"
            }
            if (Game.tutorialStep == 2) {
                tutorialMessage = "Mouse to aim, Click / Hold mouse to attack"
                instruction = `Fire (${3 - this.arsenal[0][1]}/3) shots`
            }
            if (Game.tutorialStep == 3) {
                tutorialMessage = "Right click to quickly switch to and attack with your meelee weapon"
                instruction = "Right-click your mouse"
            }
            if (Game.tutorialStep == 4) {
                tutorialMessage = "Use 1, 2, and 3 to switch between your long, side, and meelee weapon"
                instruction = "Switch to the pistol with [2]"
            }
            if (Game.tutorialStep == 5) {
                tutorialMessage = "Hover over enemies to see their stats, rank, weapon, and bounty"
                instruction = "Move your mouse over the enemy"
            }
            if (Game.tutorialStep == 6) {
                tutorialMessage =
                    "Attack gang members until they surrender or are killed. Headshots are ideal for quickly taking down dangerous enemies"
                instruction = "Shoot the enemy"
            }
            if (Game.tutorialStep == 7) {
                tutorialMessage = "Walk to the defeated gangster and press [E] to take his weapon and/or ammo"
                instruction = "Take the gangster's ammo with [E]"
            }

            canvas
                .fillStyle(colors.ui())
                .roundRect(canvas.width - 310, canvas.height - 110, 300, 100, 10)
                .fillStyle(colors.white)
                .font(10)
                .align("right")
                .text(instruction, canvas.width - 20, canvas.height - 30, 280)
                .font(15, true)
                .align("left")
                .text("Tutorial (" + (Game.tutorialStep + 1) + "/9)", canvas.width - 300, canvas.height - 100)
                .font()
                .fillStyle(colors.dwhite(0.7))
                .text(tutorialMessage, canvas.width - 300, canvas.height - 80, 280)
        } else {
            const threatCount = Game.entities.filter(e => e instanceof Enemy && !e.dead && !e.hasSurrendered).length
            canvas
                .fillStyle(colors.white)
                .align("right")
                .font(15, true)
                .text(`Level ${Game.level + 1}: ${levels[Game.level].name}`, canvas.width - 10, canvas.height - 50)
                .font()
                .text(
                    threatCount + " Active Threat" + (threatCount == 1 ? "" : "s"),
                    canvas.width - 10,
                    canvas.height - 25,
                )

            if (threatCount == 0) {
                this.winTimer--
                Game.frameRate = 20
                canvas
                    .fillStyle("#000a")
                    .fillRect(0, 0, canvas.width, canvas.height)
                    .font(20, true)
                    .fillStyle(colors.white)
                    .align("center")
                    .text("Mission Accomplished", canvas.width / 2, canvas.height / 2)
            }

            if (this.winTimer <= 0) {
                Game.frameRate = 60
                if (Game.level == levels.length - 1) {
                    Game.scene = 5
                } else {
                    levels[Game.level].completed = true
                    levels[Game.level].timeEnded = Date.now()
                    Game.scene = 3
                }
            }
        }

        // Cursor
        canvas
            .strokeStyle(colors.fgui(this.hoveringEnemy ? 0.6 : 0.5))
            .lineWidth(2)
            .lineCap("round")
            .push()
            .translate(Game.mouseX, Game.mouseY)
            .path()
            .arc(0, 0, 1, 0, Math.PI * 2)
            .moveTo(10, 0)
            .lineTo(20, 0)
            .moveTo(0, 10)
            .lineTo(0, 20)
            .moveTo(-10, 0)
            .lineTo(-20, 0)
            .moveTo(0, -10)
            .lineTo(0, -20)
            .close(0)
            .pop()
    }
}
