import { useCallback, useMemo, useState } from "react";
import { DISH_SAMPLE, FRIDGE_SAMPLE, coverageFor } from "./flagshipData";
import FeedScene from "./scenes/FeedScene";
import DishScene from "./scenes/DishScene";
import FridgeScene from "./scenes/FridgeScene";
import DecisionScene from "./scenes/DecisionScene";
import StoryRail from "./StoryRail";
import { fileToDataUrl, urlToDataUrl } from "./imageData";

const SCENE_ORDER = ["feed", "dish", "fridge", "decision"];

export default function TonightApp() {
  const [scene, setScene] = useState("feed");

  // 刷到的菜
  const [dishImage, setDishImage] = useState(null);
  const [dishIsSample, setDishIsSample] = useState(true);
  const [dishName, setDishName] = useState("");
  const [dishNote, setDishNote] = useState("");
  const [timeBudget, setTimeBudget] = useState("25 分钟");

  // 现实冰箱
  const [fridgeImage, setFridgeImage] = useState(null);
  const [fridgeIsSample, setFridgeIsSample] = useState(true);
  const [inventory, setInventory] = useState([]);

  // 模拟补购（不会真实下单）
  const [cart, setCart] = useState([]);
  const [activePlan, setActivePlan] = useState("target");

  const loadSampleDish = useCallback(async () => {
    const dataUrl = await urlToDataUrl(DISH_SAMPLE.imageUrl);
    setDishImage(dataUrl);
    setDishIsSample(true);
    setDishName(DISH_SAMPLE.name);
    setScene("dish");
  }, []);

  const acceptUploadedDish = useCallback(async (file) => {
    const dataUrl = await fileToDataUrl(file);
    setDishImage(dataUrl);
    setDishIsSample(false);
    setDishName(DISH_SAMPLE.name);
    setScene("dish");
  }, []);

  const confirmDish = useCallback(({ name, note, time }) => {
    setDishName(name);
    setDishNote(note);
    setTimeBudget(time);
    setScene("fridge");
  }, []);

  const confirmFridge = useCallback(({ image, isSample, items }) => {
    setFridgeImage(image);
    setFridgeIsSample(isSample);
    setInventory(items);
    setCart([]);
    setActivePlan("target");
    setScene("decision");
  }, []);

  const restart = useCallback(() => {
    setScene("feed");
    setDishImage(null);
    setDishName("");
    setDishNote("");
    setFridgeImage(null);
    setInventory([]);
    setCart([]);
    setActivePlan("target");
  }, []);

  const toggleCart = useCallback((name) => {
    setCart((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));
  }, []);

  const coverage = useMemo(
    () => coverageFor(DISH_SAMPLE, inventory, cart),
    [inventory, cart],
  );

  return (
    <div className="tn-app" data-scene={scene}>
      <StoryRail
        order={SCENE_ORDER}
        scene={scene}
        dishImage={dishImage}
        dishName={dishName}
        fridgeImage={fridgeImage}
        hasDecision={scene === "decision"}
      />
      <main className="tn-stage">
        {scene === "feed" && (
          <FeedScene
            onWantThis={loadSampleDish}
            onUpload={acceptUploadedDish}
          />
        )}
        {scene === "dish" && (
          <DishScene
            image={dishImage}
            isSample={dishIsSample}
            initialName={dishName || DISH_SAMPLE.name}
            initialNote={dishNote}
            initialTime={timeBudget}
            onBack={() => setScene("feed")}
            onConfirm={confirmDish}
          />
        )}
        {scene === "fridge" && (
          <FridgeScene
            dishName={dishName || DISH_SAMPLE.name}
            initialImage={fridgeImage}
            initialIsSample={fridgeIsSample}
            initialItems={inventory}
            onBack={() => setScene("dish")}
            onConfirm={confirmFridge}
          />
        )}
        {scene === "decision" && (
          <DecisionScene
            dishName={dishName || DISH_SAMPLE.name}
            dishImage={dishImage}
            timeBudget={timeBudget}
            note={dishNote}
            coverage={coverage}
            inventory={inventory}
            cart={cart}
            activePlan={activePlan}
            onSwitchPlan={setActivePlan}
            onToggleCart={toggleCart}
            onEditFridge={() => setScene("fridge")}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}
