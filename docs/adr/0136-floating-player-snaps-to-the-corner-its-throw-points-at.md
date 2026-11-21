# 0136. The floating player settles in the corner its throw points at

The floating player is dragged freely and, on release, settles in the corner its throw points at, the way system picture-in-picture does. The maths is a pure module, `src/lib/pip-position.ts` (`projectedCorner`, `cornerPosition`, `releaseVelocity`), so it tests under node.

A throw is projected with `DECELERATION` = 0.998, UIScrollView's normal deceleration rate. A throw at v px/s coasts `v * rate / (1 - rate) / 1000` px, about half a second's worth, which gives the throw distance users know from iOS. The projected centre picks the corner by which half of the viewport it lands in.

`releaseVelocity` uses only pointer samples within `windowMs` (100ms) of the newest one, so a pause before letting go reads as a drop, not a throw.

See ADR-0135.
