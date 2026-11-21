# 0142. Cell sizes and a pointer reach set in px

The home field draws on 16px triangle sides on a wide screen (`CELL_WIDE`) and 17px on a phone (`CELL_NARROW`, below 768px), in `src/lib/lattice/field.ts`. At 24px a cover was about 35 triangles across and most sleeves read as blobs; at 14px the gutters between triangles dim the picture and the grid stops looking like tiles. Title bands and blocks (fields under 520 CSS px tall) use 13px (`CELL_SMALL`): a band is a third of a screen tall, and at 13px the mark fits at twice its base scale beside a heading and a cover a third of the height keeps its detail.

The pointer's reach is set in device-independent px per field kind (`POINTER_REACH`: wide 156, narrow 110, small 84), independent of the drawn cell. The home field's cell has changed and may again, and the pointer should not feel different for it; a finer `?cell=` in dev must also keep the light the same size on screen.
