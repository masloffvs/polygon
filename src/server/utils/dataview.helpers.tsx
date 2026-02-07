export type Primitive = string | number | boolean | null;

export interface DefaultDatatype {
  args: Record<string, Primitive>;
  id: string;
}

export function isDefaultDatatype(obj: any): obj is DefaultDatatype {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.id === "string" &&
    typeof obj.args === "object" &&
    obj.args !== null
  );
}

export function Dataview(props: {
  view: React.ComponentType<any>;
  args: any;
  id: string;
}) {
  const { view: ViewComponent, args, id } = props;
  return <ViewComponent args={args} id={id} />;
}

export function LayoutDataview(props: { children: React.ReactNode }) {
  const { children } = props;
  return <>{children}</>;
}

export function dataviewOf(
  component: <TArgs extends Record<string, Primitive>>(
    args: TArgs,
  ) => React.ReactElement,
) {
  return function DataviewWrapper<
    TArgs extends Record<string, Primitive>,
  >(props: { args: TArgs; id: string }) {
    const { args } = props;
    return component(args);
  };
}

export interface SchemaManifest {
  name: string;
  type: "dataview";
  colors?: Record<string, string>;
  schema: {
    type: "object";
    properties: {
      [key: string]: {
        type: "string" | "number" | "boolean";
        description?: string;
        default?: Primitive;
      };
    };
  };
}
