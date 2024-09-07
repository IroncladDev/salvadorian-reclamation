import { canvas } from "@/lib/canvas/index"
import Game from "@/lib/game"
import { levels } from "@/lib/levels"
import { dist, normalizeToRange, pointAt } from "@/lib/utils"
import { WeaponKey, weapons } from "@/lib/weapons"
import { Bullet } from "./bullet"
import { Enemy } from "./enemy"
import { Particle } from "./particle"

export abstract class Entity {
    x: number
    y: number
    xVel = 0
    yVel = 0
    speed = 5
    w = 40
    h = 80
    xAcc = 0.5
    baseRotation = 0
    rotateTo = 0
    baseScaleTo = 1
    movingDir: -1 | 0 | 1 = 0
    movingDirTo = 0
    recoilRotation = 0
    fireFrame = 0
    canJump = false
    isAgainstWall = false
    jumpForce = 12
    dirTo = 1
    dir: -1 | 1 = 1
    weapon: WeaponKey = 0
    fireCooldown = 0
    dead = false
    weaponRotation = Math.PI / 2
    weaponRotationTo = Math.PI / 2
    knockback = 0
    abstract health: [number, number, number]
    abstract maxHealth: [number, number, number]

    constructor(x: number, y: number) {
        this.x = x
        this.y = y
    }

    get centerX() {
        return this.x + this.w / 2
    }

    get centerY() {
        return this.y + this.h / 2
    }

    get wp() {
        return weapons[this.weapon]
    }

    shoot(r: number) {
        if (this.wp.type == 1) return

        const [x, y] = pointAt(this.centerX, this.centerY + this.wp.barrelY, r, this.wp.barrelX)

        Game.bullets.push(
            new Bullet({
                type: this.weapon,
                x,
                y,
                r,
                entity: this,
            }),
        )

        if (this.wp.shell) {
            const ejectShell = () => {
                if (this.wp.type == 1 || !this.wp.shell) return

                const [sx, sy] = pointAt(this.centerX, this.centerY + this.wp.shell.y, r, this.wp.shell.x)
                Game.particles.push(
                    new Particle({
                        type: 0,
                        ...this.wp.shell,
                        x: sx,
                        y: sy,
                        r,
                        yVel: Math.random() * 5 - 15,
                        dir: this.dir,
                        lifetime: 25,
                    }),
                )
            }

            if (this.wp.shell.delay) setTimeout(ejectShell, this.wp.shell.delay)
            else ejectShell()
        }

        for (let i = 2 + Math.floor(Math.random() * 2); i--; ) {
            Game.particles.push(
                new Particle({
                    type: 1,
                    x,
                    y,
                    r: r + Math.random() * (Math.PI / 30) - Math.PI / 60,
                    lifetime: 0.25 + Math.random() * (0.5 - 0.25),
                    angle: Math.random() * (Math.PI / 16 - Math.PI / 30) + Math.PI / 30,
                    bulletSpeed: this.wp.bulletSpeed,
                }),
            )
        }

        if (this.movingDir !== 0) this.xVel += Math.cos(r) * -this.wp.recoilX
        this.recoilRotation += (Math.PI / 180) * this.wp.recoilY
        this.weaponRotationTo -= this.recoilRotation * this.dir
        this.fireCooldown = this.wp.reload
    }

    moveX() {
        if (this.movingDir === 1) {
            this.xVel += this.xAcc
            this.rotateTo += this.rotateTo.tween(Math.PI / 32, 5)
        } else if (this.movingDir === -1) {
            this.xVel -= this.xAcc
            this.rotateTo += this.rotateTo.tween(-Math.PI / 32, 5)
        } else {
            this.rotateTo += this.rotateTo.tween(0, 5)
        }

        const speedCap = (this.speed - (this.wp.type == 1 ? 0 : this.wp.weight)) / (this.movingDir !== this.dir ? 2 : 1)

        this.xVel += this.xVel.tween(0, 10)
        this.xVel = Math.min(Math.max(this.xVel, -speedCap), speedCap) - this.knockback

        this.x += this.xVel
    }

    moveY() {
        if (this.y > levels[Game.level].map.length * Game.blockSize + 500) this.dead = true

        if (this.yVel + Game.gravity < Game.maxVelocity) {
            this.yVel += Game.gravity
        }

        this.yVel = Math.min(Math.max(this.yVel, -this.jumpForce), Game.maxVelocity)
        this.y += this.yVel
    }

    animateVars() {
        this.baseRotation += this.baseRotation.tween(this.rotateTo, 5)
        this.baseScaleTo += this.baseScaleTo.tween(this.dir, 5)
        this.movingDirTo += this.movingDirTo.tween(this.movingDir, 5)
        this.fireFrame += this.fireFrame.tween(0, this.wp.frameDelay || 1)
        this.recoilRotation += this.recoilRotation.tween(0, 10)
        this.dirTo += this.dirTo.tween(this.dir, 5)
        this.knockback += this.knockback.tween(0, 5)

        const angle = this.weaponRotation % (Math.PI * 2)
        let delta = angle - (this.weaponRotationTo % (Math.PI * 2))
        if (delta < -Math.PI) delta += Math.PI * 2
        if (delta > Math.PI) delta -= Math.PI * 2
        this.weaponRotationTo += this.weaponRotationTo.tween(this.weaponRotationTo + delta, 5)
    }

    handleBulletCollisions(onCollide?: (bullet: Bullet) => void) {
        for (const bullet of Game.bullets) {
            if (bullet.entity === this) continue

            const headCollision = bullet.withRectCollision(
                this.x + this.w / 4 + 10 * this.movingDirTo,
                this.y,
                this.w / 2,
                20,
            )
            const bodyCollision = bullet.withRectCollision(
                this.x + this.w / 8 + 7.5 * this.movingDirTo + (this.dir === -1 ? 5 : 0),
                this.y + 20,
                25,
                40,
            )
            const legsCollision = bullet.withRectCollision(
                this.x + this.w / 8 + 7.5 * this.movingDirTo + (this.dir === -1 ? 5 : 0),
                this.y + 60,
                25,
                20,
            )

            if (headCollision.colliding || bodyCollision.colliding || legsCollision.colliding) {
                const minRot = normalizeToRange(bullet.r)
                const bulletDir = minRot > -Math.PI / 2 && minRot < Math.PI / 2 ? -1 : 1

                Game.particles.push(
                    new Particle({
                        type: 3,
                        x: bullet.x,
                        y: bullet.y,
                        lifetime: 1,
                        tail: 0,
                        bulletSpeed: bullet.wp.bulletSpeed,
                        r: bullet.r,
                    }),
                )

                if (headCollision.colliding) {
                    this.health[0] -= bullet.wp.damage
                    this.knockback = (bullet.wp.damage / 2) * bulletDir
                    this.rotateTo += bullet.wp.damage * 10 * (Math.PI / 180) * -this.dir
                    onCollide?.(bullet)
                }

                if (bodyCollision.colliding) {
                    this.health[1] -= bullet.wp.damage
                    this.knockback = (bullet.wp.damage / 4) * bulletDir
                    onCollide?.(bullet)
                }

                if (legsCollision.colliding) {
                    this.health[2] -= bullet.wp.damage
                    this.knockback = (bullet.wp.damage / 4) * bulletDir
                    this.rotateTo += bullet.wp.damage * 5 * (Math.PI / 180) * this.dir
                    onCollide?.(bullet)
                }

                bullet.dead = true
            }
        }
    }

    notifyClosest(x: number) {
        setTimeout(() => {
            const closestEnemy = Game.entities
                .filter(
                    e =>
                        !("hasFired" in e) &&
                        e !== this &&
                        !(e as Enemy).hasSurrendered &&
                        !(e as Enemy).dying &&
                        !(e as Enemy).hasSeenPlayer,
                )
                .sort((a, b) => a.dist(this.centerX, this.centerY) - b.dist(this.centerX, this.centerY))[0]

            if (
                closestEnemy &&
                Math.abs(x - closestEnemy.centerX) < canvas.canvasWidth / 2 &&
                Math.abs(this.centerY - closestEnemy.centerY) < canvas.canvasHeight / 2
            ) {
                closestEnemy.dir = x < closestEnemy.centerX ? -1 : 1
            }
        }, 500)
    }

    jump() {
        this.yVel = -(this.jumpForce - (this.wp.type == 1 ? 0 : this.wp.weight))
        this.canJump = false
    }

    dist(x: number, y: number) {
        return dist(this.centerX, this.centerY, x, y)
    }

    gunTip(): [number, number] {
        return this.wp.type == 1
            ? [this.centerX, this.centerY]
            : pointAt(this.centerX, this.centerY + this.wp.barrelY, this.weaponRotationTo, this.wp.barrelX)
    }

    abstract render(): void
    abstract run(): void
}
