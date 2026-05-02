import { JSXElement, Match, Switch, createMemo } from "solid-js"
import { getSetting, objStore, State } from "~/store"
import { ObjType } from "~/types"
import { Box, Container as HopeContainer } from "@hope-ui/solid"

export const Container = (props: { children: JSXElement }) => {
  const container = getSetting("home_container")
  const contentWidth = createMemo(() =>
    objStore.state === State.File && objStore.obj.type === ObjType.VIDEO
      ? "min(99%, 1480px)"
      : "min(99%, 980px)",
  )

  return (
    <Switch fallback={<Box w={contentWidth()}>{props.children}</Box>}>
      <Match when={container === "hope_container"}>
        <HopeContainer w="$full" maxW={contentWidth()}>
          {props.children}
        </HopeContainer>
      </Match>
    </Switch>
  )
}
