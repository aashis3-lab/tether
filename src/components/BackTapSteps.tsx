/** iPhone Back Tap setup (double-tap the back of the phone to open Tether). */
export function BackTapSteps() {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-lg">
      <li>Add Tether to your Home Screen (Share → Add to Home Screen).</li>
      <li>In the Shortcuts app, make a shortcut that opens Tether.</li>
      <li>Settings → Accessibility → Touch → Back Tap → Double Tap → pick that shortcut.</li>
      <li>Test it: double-tap the back of your phone.</li>
    </ol>
  )
}
